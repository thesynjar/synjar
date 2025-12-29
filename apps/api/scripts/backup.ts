#!/usr/bin/env ts-node
import { BackupManager } from './backup-manager';

// CLI Interface for backup operations
async function main() {
  const command = process.argv[2];
  const backupManager = new BackupManager();

  try {
    switch (command) {
      case 'create': {
        const type =
          (process.argv[3] as 'pre-migration' | 'manual' | 'daily') || 'manual';
        await backupManager.createBackup(type);
        break;
      }

      case 'list': {
        const remote = process.argv.includes('--remote');
        await backupManager.listBackups(remote);
        break;
      }

      case 'restore': {
        // Find backup ID or path (skip flags)
        const args = process.argv.slice(3).filter((arg) => !arg.startsWith('--'));
        const backupIdOrPath = args[0];
        const forceRestore = process.argv.includes('--force');
        const cleanBefore = process.argv.includes('--clean-before');
        await backupManager.restoreBackup(backupIdOrPath, forceRestore, cleanBefore);
        break;
      }

      case 'pre-migration': {
        // Special command for startup script integration
        const success = await backupManager.createPreMigrationBackup();
        process.exit(success ? 0 : 1);
        break;
      }

      case 'cleanup': {
        // Cleanup old backups based on retention policy
        await backupManager.cleanupOldBackups();
        break;
      }

      case 'download': {
        // Download a backup from B2 by key
        const backupKey = process.argv[3];
        if (!backupKey) {
          console.error('Error: Backup key required');
          console.log('Usage: npm run backup:download <backup-key>');
          process.exit(1);
        }
        await backupManager.downloadFromB2(backupKey);
        break;
      }

      default:
        console.log('Synjar Backup Manager');
        console.log('');
        console.log('Usage:');
        console.log(
          '  pnpm --filter api run backup:create [type]     Create new backup (manual|daily|pre-migration)',
        );
        console.log(
          '  pnpm --filter api run backup:list [--remote]   List backups (local or remote)',
        );
        console.log(
          '  pnpm --filter api run backup:restore [id|path] [--force] [--clean-before]',
        );
        console.log(
          '                                                 Restore from backup ID, file path, or latest',
        );
        console.log(
          '                                                 --force skips safety backup',
        );
        console.log(
          '                                                 --clean-before cleans database before restore',
        );
        console.log(
          '  pnpm --filter api run backup:cleanup           Cleanup old backups (retention policy)',
        );
        console.log(
          '  pnpm --filter api run backup:download <key>    Download backup from B2',
        );
        console.log('');
        console.log('Pre-migration (startup script):');
        console.log(
          '  node dist/scripts/backup.js pre-migration      Pre-migration backup for startup',
        );
        break;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Command failed:', message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
