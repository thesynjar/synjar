import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';
import { IStorageService, UploadResult } from '@/domain/document/storage.port';

@Injectable()
export class BackblazeStorageService implements IStorageService {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string;
  private readonly usePathStyle: boolean;

  constructor(private readonly configService: ConfigService) {
    const rawEndpoint = this.configService.getOrThrow<string>('B2_ENDPOINT');
    this.bucketName = this.configService.getOrThrow('B2_BUCKET_NAME');

    // Support both full URLs (http://localhost:6214) and hostnames (s3.backblazeb2.com)
    // Full URLs indicate local/test environment (MinIO) using path-style access
    this.usePathStyle = rawEndpoint.startsWith('http://') || rawEndpoint.startsWith('https://');
    this.endpoint = this.usePathStyle ? rawEndpoint : `https://${rawEndpoint}`;

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: this.configService.get('B2_REGION', 'eu-central-003'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('B2_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow('B2_APPLICATION_KEY'),
      },
      forcePathStyle: this.usePathStyle,
    });
  }

  async upload(
    file: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<UploadResult> {
    const key = `${uuid()}-${this.sanitizeFilename(filename)}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: mimeType,
      }),
    );

    // Path-style: http://localhost:6214/bucket/key (MinIO)
    // Virtual-hosted: https://bucket.endpoint/key (Backblaze B2)
    const url = this.usePathStyle
      ? `${this.endpoint}/${this.bucketName}/${key}`
      : `https://${this.bucketName}.${this.endpoint.replace('https://', '')}/${key}`;

    return {
      url,
      key,
      size: file.length,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '-')
      .replace(/-+/g, '-');
  }
}
