#!/usr/bin/env ts-node
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { S3Client } from '@aws-sdk/client-s3';

type AwsSdkModule = typeof import('@aws-sdk/client-s3');

// Note: In production/staging, environment variables are set by Docker/CapRover
// dotenv is only needed for local development (handled by ts-node or dev scripts)

const execFileAsync = promisify(execFile);

// Security: Validate PostgreSQL identifier (table/database names)
// Only allow alphanumeric, underscore, and must start with letter or underscore
function isValidPostgresIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length <= 63;
}

// Security: Escape shell argument for safe use (defense in depth)
function escapeShellArg(arg: string): string {
  // For execFile we don't need escaping, but validate for safety
  if (arg.includes('\0')) {
    throw new Error('Invalid argument: contains null byte');
  }
  return arg;
}

// SEC-H4: Validate B2 endpoint to prevent SSRF attacks
// Only allow legitimate Backblaze B2 endpoints
function isValidB2Endpoint(endpoint: string): boolean {
  // Must be a Backblaze B2 endpoint (e.g., s3.eu-central-003.backblazeb2.com)
  const b2EndpointPattern = /^s3\.[a-z0-9-]+\.backblazeb2\.com$/;
  return b2EndpointPattern.test(endpoint);
}

interface BackupConfig {
  // PostgreSQL connection (parsed from DATABASE_URL)
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;

  // Backblaze B2 (separate bucket for backups)
  b2KeyId?: string;
  b2AppKey?: string;
  b2BucketName?: string;
  b2Endpoint: string;

  // Security
  encryptionKey: string;

  // Local backup directory
  backupDir: string;

  // Retention policy
  retentionDays: number;
}

interface BackupMetadata {
  id: string; // Unique backup identifier
  timestamp: string; // ISO timestamp
  filename: string; // Encrypted file name
  size: number; // File size in bytes
  checksumSha256: string; // SHA-256 hash
  encrypted: boolean; // Always true
  type: 'pre-migration' | 'manual' | 'daily' | 'pre-restore';
  uploadedToB2: boolean; // Upload status
  b2ObjectKey?: string; // B2 object path
}

/**
 * Parses a PostgreSQL DATABASE_URL into components.
 * Format: postgresql://user:password@host:port/database?schema=public
 */
function parseDatabaseUrl(url: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const regex =
    /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/;
  const match = url.match(regex);

  if (!match) {
    throw new Error(`Invalid DATABASE_URL format: ${url}`);
  }

  return {
    user: match[1],
    password: decodeURIComponent(match[2]),
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5],
  };
}

export class BackupManager {
  private config: BackupConfig;
  private s3Client?: S3Client;
  private s3Module?: AwsSdkModule;
  private b2Enabled: boolean;

  constructor() {
    // Prefer DATABASE_URL_MIGRATE for backups (superuser needed for pg_dump/pg_restore)
    // Falls back to DATABASE_URL if migrate URL not available
    const databaseUrl =
      process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL or DATABASE_URL_MIGRATE environment variable is required',
      );
    }

    if (!process.env.DATABASE_URL_MIGRATE && process.env.NODE_ENV === 'production') {
      console.warn(
        '[BackupManager] Warning: Using DATABASE_URL for backups. ' +
          'Consider setting DATABASE_URL_MIGRATE with superuser for full backup capabilities.',
      );
    }

    const dbConfig = parseDatabaseUrl(databaseUrl);

    this.config = {
      ...dbConfig,
      b2KeyId: process.env.BACKUP_B2_KEY_ID,
      b2AppKey: process.env.BACKUP_B2_APP_KEY,
      b2BucketName: process.env.BACKUP_B2_BUCKET_NAME,
      b2Endpoint:
        process.env.BACKUP_B2_ENDPOINT || 's3.eu-central-003.backblazeb2.com',
      encryptionKey:
        process.env.BACKUP_ENCRYPTION_KEY || this.generateEncryptionKey(),
      backupDir: path.join(process.cwd(), 'backups'),
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
    };

    this.b2Enabled = Boolean(
      this.config.b2KeyId && this.config.b2AppKey && this.config.b2BucketName,
    );

    // Initialize B2 client if credentials are available
    if (this.b2Enabled) {
      // SEC-H4: Validate B2 endpoint to prevent SSRF
      if (!isValidB2Endpoint(this.config.b2Endpoint)) {
        throw new Error(
          `Invalid B2 endpoint: ${this.config.b2Endpoint}. ` +
          'Must be a Backblaze B2 endpoint (e.g., s3.eu-central-003.backblazeb2.com)'
        );
      }

      // Try to load S3 module - if not available, gracefully disable B2
      const s3Module = this.tryLoadS3Module();
      if (s3Module) {
        const { S3Client } = s3Module;
        this.s3Client = new S3Client({
          endpoint: `https://${this.config.b2Endpoint}`,
          credentials: {
            accessKeyId: this.config.b2KeyId!,
            secretAccessKey: this.config.b2AppKey!,
          },
          region: 'eu-central-003',
        });
      } else {
        // Disable B2 if SDK not available
        this.b2Enabled = false;
        console.warn(
          '⚠️  B2 credentials configured but @aws-sdk/client-s3 not installed. ' +
          'Backups will be stored locally only.',
        );
        console.warn(
          '   To enable B2 uploads, install: npm install @aws-sdk/client-s3',
        );
      }
    }

    // Ensure backup directory exists
    if (!fs.existsSync(this.config.backupDir)) {
      fs.mkdirSync(this.config.backupDir, { recursive: true });
    }

    // Warn if encryption key was auto-generated (SEC-H3: never log the actual key)
    if (!process.env.BACKUP_ENCRYPTION_KEY) {
      console.warn(
        '⚠️  BACKUP_ENCRYPTION_KEY not set - generated temporary key for this session',
      );
      console.warn(
        '   Generate a permanent key with: openssl rand -hex 32',
      );
      console.warn(
        '   Then add to .env: BACKUP_ENCRYPTION_KEY=<your-generated-key>',
      );
    }
  }

  private generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private tryLoadS3Module(): AwsSdkModule | null {
    if (this.s3Module) {
      return this.s3Module;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.s3Module = require('@aws-sdk/client-s3') as AwsSdkModule;
      return this.s3Module;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'MODULE_NOT_FOUND') {
        return null;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to load @aws-sdk/client-s3: ${message}`);
      return null;
    }
  }

  private getS3Module(): AwsSdkModule {
    if (!this.s3Module) {
      throw new Error('B2 client not initialized');
    }
    return this.s3Module;
  }

  private generateBackupId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = crypto.randomBytes(4).toString('hex');
    return `synjar-${timestamp}-${random}`;
  }

  private calculateChecksum(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  private encryptFile(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(this.config.encryptionKey, 'hex');
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv(algorithm, key, iv);
        const input = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath);

        // Write IV at the beginning
        output.write(iv);

        input.pipe(cipher).pipe(output);

        output.on('finish', resolve);
        output.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  private decryptFile(inputPath: string, outputPath: string): void {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(this.config.encryptionKey, 'hex');

    const fileData = fs.readFileSync(inputPath);
    const iv = fileData.slice(0, 16);
    const encryptedData = fileData.slice(16);

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    fs.writeFileSync(outputPath, decrypted);
  }

  private getManifestPath(): string {
    return path.join(this.config.backupDir, 'backup-manifest.json');
  }

  private loadManifest(): BackupMetadata[] {
    const manifestPath = this.getManifestPath();
    if (!fs.existsSync(manifestPath)) {
      return [];
    }
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      return [];
    }
  }

  private saveManifest(manifest: BackupMetadata[]): void {
    fs.writeFileSync(this.getManifestPath(), JSON.stringify(manifest, null, 2));
  }

  async createBackup(
    type: 'pre-migration' | 'manual' | 'daily' | 'pre-restore' = 'manual',
  ): Promise<string> {
    const backupId = this.generateBackupId();
    const backupFileName = `${backupId}.sql`;
    const backupPath = path.join(this.config.backupDir, backupFileName);

    console.log(`Creating ${type} PostgreSQL backup...`);

    try {
      // Validate database name (SEC-C1: prevent injection)
      if (!isValidPostgresIdentifier(this.config.database)) {
        throw new Error(`Invalid database name: ${this.config.database}`);
      }

      // Create PostgreSQL dump using execFile (SEC-C2: prevent command injection)
      const pgDumpArgs = [
        `--host=${escapeShellArg(this.config.host)}`,
        `--port=${this.config.port}`,
        `--username=${escapeShellArg(this.config.user)}`,
        '--verbose',
        '--clean',
        '--no-owner',
        '--no-privileges',
        '--format=plain',
        `--file=${escapeShellArg(backupPath)}`,
        escapeShellArg(this.config.database),
      ];

      // SEC-H2: Use PGPASSFILE instead of PGPASSWORD in environment
      // PGPASSWORD in env is visible via `ps aux`, PGPASSFILE is more secure
      const pgpassPath = path.join(this.config.backupDir, '.pgpass');
      const pgpassContent = `${this.config.host}:${this.config.port}:${this.config.database}:${this.config.user}:${this.config.password}`;
      fs.writeFileSync(pgpassPath, pgpassContent, { mode: 0o600 });

      const env = {
        ...process.env,
        PGPASSFILE: pgpassPath,
      };

      try {
        await execFileAsync('pg_dump', pgDumpArgs, { env });
      } finally {
        // Always clean up pgpass file
        if (fs.existsSync(pgpassPath)) fs.unlinkSync(pgpassPath);
      }
      console.log(`Backup created: ${backupPath}`);

      // Compress backup using execFile (SEC-C2: prevent command injection)
      const compressedPath = `${backupPath}.gz`;
      await execFileAsync('gzip', [escapeShellArg(backupPath)]);
      console.log(`Backup compressed: ${compressedPath}`);

      // Encrypt backup
      const encryptedPath = `${compressedPath}.enc`;
      await this.encryptFile(compressedPath, encryptedPath);
      console.log(`Backup encrypted: ${encryptedPath}`);

      // Calculate checksum
      const checksum = this.calculateChecksum(encryptedPath);
      const fileStats = fs.statSync(encryptedPath);

      // Create metadata
      const metadata: BackupMetadata = {
        id: backupId,
        timestamp: new Date().toISOString(),
        filename: path.basename(encryptedPath),
        size: fileStats.size,
        checksumSha256: checksum,
        encrypted: true,
        type,
        uploadedToB2: false,
      };

      // Upload to B2 if configured
      if (this.s3Client && this.config.b2BucketName) {
        try {
          console.log('Uploading to Backblaze B2...');
          await this.uploadToB2(encryptedPath, metadata);
          metadata.uploadedToB2 = true;
          metadata.b2ObjectKey = this.getB2ObjectKey(metadata);
          console.log(`Uploaded to B2: ${metadata.b2ObjectKey}`);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.log(`B2 upload failed: ${message}`);
          console.log('Backup stored locally only');
          metadata.uploadedToB2 = false;
        }
      } else {
        console.log(
          'Backblaze B2 credentials not configured - backup stored locally only',
        );
      }

      // Update manifest
      const manifest = this.loadManifest();
      manifest.unshift(metadata);
      // Keep only last 30 backups in manifest (local retention)
      if (manifest.length > 30) {
        manifest.splice(30);
      }
      this.saveManifest(manifest);

      // Clean up intermediate files
      if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);

      console.log(`Backup ${backupId} completed successfully!`);

      return encryptedPath;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Backup failed:', message);
      throw error;
    }
  }

  private getB2ObjectKey(metadata: BackupMetadata): string {
    const date = new Date(metadata.timestamp).toISOString().split('T')[0];
    return `${metadata.type}/${date}/${metadata.filename}`;
  }

  private async uploadToB2(
    filePath: string,
    metadata: BackupMetadata,
  ): Promise<void> {
    if (!this.s3Client || !this.config.b2BucketName) {
      throw new Error('B2 client not initialized');
    }

    const fileData = fs.readFileSync(filePath);
    const objectKey = this.getB2ObjectKey(metadata);

    const { PutObjectCommand } = this.getS3Module();
    const command = new PutObjectCommand({
      Bucket: this.config.b2BucketName,
      Key: objectKey,
      Body: fileData,
      Metadata: {
        'backup-id': metadata.id,
        'backup-type': metadata.type,
        'checksum-sha256': metadata.checksumSha256,
        'created-timestamp': metadata.timestamp,
      },
    });

    await this.s3Client.send(command);
  }

  async listBackups(remote: boolean = false): Promise<void> {
    if (remote && this.s3Client && this.config.b2BucketName) {
      console.log('Remote backups (Backblaze B2):');
      await this.listRemoteBackups();
    } else {
      console.log('Local backups:');
      await this.listLocalBackups();
    }
  }

  private async listLocalBackups(): Promise<void> {
    const manifest = this.loadManifest();

    if (manifest.length === 0) {
      console.log('   No backups found');
      return;
    }

    manifest.forEach((backup, index) => {
      const sizeInMB = (backup.size / (1024 * 1024)).toFixed(2);
      const uploadStatus = backup.uploadedToB2 ? '[B2]' : '[local]';

      console.log(`   ${index + 1}. ${backup.id}`);
      console.log(`      Type: ${backup.type} ${uploadStatus}`);
      console.log(`      Size: ${sizeInMB} MB`);
      console.log(`      Created: ${backup.timestamp}`);
      console.log('');
    });
  }

  private async listRemoteBackups(): Promise<void> {
    if (!this.s3Client || !this.config.b2BucketName) {
      console.log('   B2 client not configured');
      return;
    }

    try {
      const { ListObjectsV2Command } = this.getS3Module();
      const command = new ListObjectsV2Command({
        Bucket: this.config.b2BucketName,
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        console.log('   No remote backups found');
        return;
      }

      response.Contents.forEach((object, index) => {
        const sizeInMB = ((object.Size || 0) / (1024 * 1024)).toFixed(2);
        console.log(`   ${index + 1}. ${object.Key}`);
        console.log(`      Size: ${sizeInMB} MB`);
        console.log(`      Modified: ${object.LastModified?.toISOString()}`);
        console.log('');
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to list remote backups:', message);
    }
  }

  async restoreBackup(
    backupIdOrPath?: string,
    force: boolean = false,
    cleanBefore: boolean = false,
  ): Promise<void> {
    try {
      let selectedBackup: BackupMetadata | null = null;
      let encryptedPath: string;

      if (backupIdOrPath) {
        // Check if it's a file path (contains / or .enc extension)
        if (backupIdOrPath.includes('/') || backupIdOrPath.endsWith('.enc')) {
          // Treat as file path
          if (path.isAbsolute(backupIdOrPath)) {
            encryptedPath = backupIdOrPath;
          } else {
            encryptedPath = path.resolve(backupIdOrPath);
          }

          if (!fs.existsSync(encryptedPath)) {
            throw new Error(`Backup file not found: ${encryptedPath}`);
          }

          console.log(`Restoring backup from file: ${encryptedPath}...`);

          // Generate temporary backup metadata for file-based restore
          const fileStats = fs.statSync(encryptedPath);
          selectedBackup = {
            id: `external-${Date.now()}`,
            timestamp: new Date().toISOString(),
            filename: path.basename(encryptedPath),
            size: fileStats.size,
            checksumSha256: 'unknown',
            encrypted: true,
            type: 'manual',
            uploadedToB2: false,
          };
        } else {
          // Treat as backup ID
          const manifest = this.loadManifest();
          const backup = manifest.find((b) => b.id === backupIdOrPath);
          if (!backup) {
            throw new Error(`Backup ${backupIdOrPath} not found`);
          }
          selectedBackup = backup;

          encryptedPath = path.join(
            this.config.backupDir,
            selectedBackup.filename,
          );

          if (!fs.existsSync(encryptedPath)) {
            throw new Error(`Backup file not found: ${encryptedPath}`);
          }

          console.log(`Restoring backup: ${selectedBackup.id}...`);
          console.log(`Created: ${selectedBackup.timestamp}`);
        }
      } else {
        // Use latest backup
        const manifest = this.loadManifest();
        if (manifest.length === 0) {
          throw new Error('No backups available for restore');
        }
        selectedBackup = manifest[0]; // Latest backup

        encryptedPath = path.join(
          this.config.backupDir,
          selectedBackup.filename,
        );

        if (!fs.existsSync(encryptedPath)) {
          throw new Error(`Backup file not found: ${encryptedPath}`);
        }

        console.log(`Restoring backup: ${selectedBackup.id}...`);
        console.log(`Created: ${selectedBackup.timestamp}`);
      }

      // Create safety backup if not forced to skip
      if (!force) {
        console.log('Creating safety backup of current database...');
        try {
          await this.createBackup('pre-restore');
          console.log('Safety backup created successfully');
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.log(`Safety backup failed: ${message}`);
          console.log(
            'Continue with restore anyway? (Current data will be lost!)',
          );
          throw new Error(
            'Safety backup failed. Use --force to skip safety backup.',
          );
        }
      } else {
        console.log('Skipping safety backup (--force flag used)');
      }

      // Clean database if requested
      if (cleanBefore) {
        console.log('Cleaning database before restore...');
        try {
          await this.cleanDatabase();
          console.log('Database cleaned successfully before restore!');
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error('Database cleanup failed:', message);
          throw new Error(`Database cleanup failed: ${message}`);
        }
      }

      // Decrypt backup
      const tempDir = path.join(this.config.backupDir, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const compressedPath = path.join(tempDir, `${selectedBackup.id}.sql.gz`);
      const sqlPath = path.join(tempDir, `${selectedBackup.id}.sql`);

      console.log('Decrypting backup...');
      this.decryptFile(encryptedPath, compressedPath);

      console.log('Decompressing backup...');
      await execFileAsync('gunzip', [escapeShellArg(compressedPath)]);

      console.log('Restoring PostgreSQL database...');

      // Validate database name (SEC-C1: prevent injection)
      if (!isValidPostgresIdentifier(this.config.database)) {
        throw new Error(`Invalid database name: ${this.config.database}`);
      }

      // Create restore command using execFile (SEC-C2: prevent command injection)
      const psqlArgs = [
        `--host=${escapeShellArg(this.config.host)}`,
        `--port=${this.config.port}`,
        `--username=${escapeShellArg(this.config.user)}`,
        `--file=${escapeShellArg(sqlPath)}`,
        escapeShellArg(this.config.database),
      ];

      // SEC-H2: Use PGPASSFILE instead of PGPASSWORD
      const pgpassPath = path.join(this.config.backupDir, '.pgpass');
      const pgpassContent = `${this.config.host}:${this.config.port}:${this.config.database}:${this.config.user}:${this.config.password}`;
      fs.writeFileSync(pgpassPath, pgpassContent, { mode: 0o600 });

      const env = {
        ...process.env,
        PGPASSFILE: pgpassPath,
      };

      try {
        await execFileAsync('psql', psqlArgs, { env });
      } finally {
        // Always clean up pgpass file
        if (fs.existsSync(pgpassPath)) fs.unlinkSync(pgpassPath);
      }

      console.log('Cleaning up temporary files...');
      if (fs.existsSync(sqlPath)) fs.unlinkSync(sqlPath);
      if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);

      console.log(`Database restored from backup: ${selectedBackup.id}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Restore failed:', message);
      throw error;
    }
  }

  // Clean all tables from public schema (Synjar uses RLS, not schema isolation)
  async cleanDatabase(): Promise<void> {
    console.log('Starting database cleanup...');

    try {
      // Validate database name (SEC-C1: prevent injection)
      if (!isValidPostgresIdentifier(this.config.database)) {
        throw new Error(`Invalid database name: ${this.config.database}`);
      }

      // SEC-H2: Use PGPASSFILE instead of PGPASSWORD
      const pgpassPath = path.join(this.config.backupDir, '.pgpass');
      const pgpassContent = `${this.config.host}:${this.config.port}:${this.config.database}:${this.config.user}:${this.config.password}`;
      fs.writeFileSync(pgpassPath, pgpassContent, { mode: 0o600 });

      const env = {
        ...process.env,
        PGPASSFILE: pgpassPath,
      };

      try {
        // Get list of all tables in public schema using execFile (SEC-C2)
        console.log('Getting list of tables in public schema...');
        const getTablesArgs = [
          `--host=${escapeShellArg(this.config.host)}`,
          `--port=${this.config.port}`,
          `--username=${escapeShellArg(this.config.user)}`,
          '--tuples-only',
          '--no-align',
          '--command=SELECT tablename FROM pg_tables WHERE schemaname = \'public\';',
          escapeShellArg(this.config.database),
        ];

        const { stdout } = await execFileAsync('psql', getTablesArgs, { env });
        const tables = stdout
          .trim()
          .split('\n')
          .filter((table) => table.trim());

        console.log(
          `Found ${tables.length} tables in public schema: ${tables.join(', ')}`,
        );

        // Drop all tables in public schema
        if (tables.length > 0) {
          console.log('Dropping all tables in public schema...');

          // Drop tables one by one to avoid dependency issues
          for (const table of tables) {
            // SEC-C1: CRITICAL - Validate table name before using in SQL
            // Table names from pg_tables should always be valid, but defense in depth
            if (!isValidPostgresIdentifier(table)) {
              console.warn(`Skipping invalid table name: ${table}`);
              continue;
            }

            // Use double-quoted identifier for safety (handles reserved words)
            const dropArgs = [
              `--host=${escapeShellArg(this.config.host)}`,
              `--port=${this.config.port}`,
              `--username=${escapeShellArg(this.config.user)}`,
              `--command=DROP TABLE IF EXISTS public."${table}" CASCADE;`,
              escapeShellArg(this.config.database),
            ];

            await execFileAsync('psql', dropArgs, { env });
          }
          console.log(`Dropped ${tables.length} tables in public schema`);
        }
      } finally {
        // Always clean up pgpass file
        if (fs.existsSync(pgpassPath)) fs.unlinkSync(pgpassPath);
      }

      console.log('Database cleanup completed successfully!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Database cleanup failed:', message);
      throw error;
    }
  }

  // Non-blocking backup for startup integration
  async createPreMigrationBackup(): Promise<boolean> {
    try {
      console.log('Starting pre-migration backup...');
      await this.createBackup('pre-migration');
      console.log('Pre-migration backup completed successfully!');
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Pre-migration backup failed:', message);
      return false;
    }
  }

  // Retention policy: cleanup old backups
  async cleanupOldBackups(): Promise<void> {
    console.log(`Cleaning up backups older than ${this.config.retentionDays} days...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    // Clean local backups
    await this.cleanupLocalBackups(cutoffDate);

    // Clean remote backups
    if (this.s3Client && this.config.b2BucketName) {
      await this.cleanupRemoteBackups(cutoffDate);
    }

    console.log('Backup cleanup completed!');
  }

  private async cleanupLocalBackups(cutoffDate: Date): Promise<void> {
    const manifest = this.loadManifest();
    const toKeep: BackupMetadata[] = [];
    const toDelete: BackupMetadata[] = [];

    for (const backup of manifest) {
      const backupDate = new Date(backup.timestamp);
      if (backupDate >= cutoffDate) {
        toKeep.push(backup);
      } else {
        toDelete.push(backup);
      }
    }

    // Delete old local backup files
    for (const backup of toDelete) {
      const filePath = path.join(this.config.backupDir, backup.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted local backup: ${backup.id}`);
      }
    }

    // Update manifest
    this.saveManifest(toKeep);

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} local backup(s)`);
    } else {
      console.log('No local backups to clean up');
    }
  }

  private async cleanupRemoteBackups(cutoffDate: Date): Promise<void> {
    if (!this.s3Client || !this.config.b2BucketName) {
      return;
    }

    try {
      const { ListObjectsV2Command } = this.getS3Module();
      const command = new ListObjectsV2Command({
        Bucket: this.config.b2BucketName,
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        console.log('No remote backups to clean up');
        return;
      }

      let deletedCount = 0;
      for (const object of response.Contents) {
        if (object.LastModified && object.LastModified < cutoffDate && object.Key) {
          const { DeleteObjectCommand } = this.getS3Module();
          const deleteCommand = new DeleteObjectCommand({
            Bucket: this.config.b2BucketName,
            Key: object.Key,
          });
          await this.s3Client.send(deleteCommand);
          console.log(`Deleted remote backup: ${object.Key}`);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} remote backup(s)`);
      } else {
        console.log('No remote backups to clean up');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to cleanup remote backups:', message);
    }
  }

  // Download backup from B2 to local
  async downloadFromB2(backupKey: string): Promise<string> {
    if (!this.s3Client || !this.config.b2BucketName) {
      throw new Error('B2 client not configured');
    }

    console.log(`Downloading backup from B2: ${backupKey}...`);

    const { GetObjectCommand } = this.getS3Module();
    const command = new GetObjectCommand({
      Bucket: this.config.b2BucketName,
      Key: backupKey,
    });

    const response = await this.s3Client.send(command);
    const filename = path.basename(backupKey);
    const localPath = path.join(this.config.backupDir, filename);

    if (response.Body) {
      const chunks: Buffer[] = [];
      // @ts-expect-error - response.Body is a readable stream
      for await (const chunk of response.Body) {
        chunks.push(Buffer.from(chunk));
      }
      fs.writeFileSync(localPath, Buffer.concat(chunks));
      console.log(`Downloaded to: ${localPath}`);
      return localPath;
    }

    throw new Error('Empty response from B2');
  }
}
