import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { WorkspaceLimits } from '../../domain/workspace/workspace-limits';

@Injectable()
export class WorkspaceLimitsService {
  private readonly limits: WorkspaceLimits;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Read limits from env (with defaults)
    const maxFileSizeMb = this.configService.get<number>('MAX_FILE_SIZE_MB', 50);
    const maxStorageGb = this.configService.get<number>('MAX_STORAGE_GB', 1);
    const maxDocuments = this.configService.get<number>('MAX_DOCUMENTS', 1000);

    this.limits = {
      maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
      maxStorageBytes: maxStorageGb * 1024 * 1024 * 1024,
      maxDocuments,
    };
  }

  getMaxFileSizeBytes(): number {
    return this.limits.maxFileSizeBytes;
  }

  getLimitsSync(): WorkspaceLimits {
    return this.limits;
  }

  async checkStorageLimit(
    workspaceId: string,
    newFileSize: number,
  ): Promise<void> {
    const limits = await this.getLimits(workspaceId);
    const currentUsage = await this.getCurrentStorageUsage(workspaceId);

    if (currentUsage + newFileSize > limits.maxStorageBytes) {
      throw new BadRequestException(
        `Storage limit exceeded. Current usage: ${this.formatBytes(currentUsage)}, ` +
          `limit: ${this.formatBytes(limits.maxStorageBytes)}`,
      );
    }
  }

  async checkDocumentLimit(workspaceId: string): Promise<void> {
    const limits = await this.getLimits(workspaceId);
    const currentCount = await this.getCurrentDocumentCount(workspaceId);

    if (currentCount >= limits.maxDocuments) {
      throw new BadRequestException(
        `Document limit exceeded. Current count: ${currentCount}, limit: ${limits.maxDocuments}`,
      );
    }
  }

  async checkFileSizeLimit(
    fileSize: number,
    _workspaceId: string,
  ): Promise<void> {
    if (fileSize > this.limits.maxFileSizeBytes) {
      throw new BadRequestException(
        `File size ${this.formatBytes(fileSize)} exceeds limit of ${this.formatBytes(this.limits.maxFileSizeBytes)}`,
      );
    }
  }

  async getUsageStats(workspaceId: string): Promise<{
    storage: { used: number; limit: number; percentage: number };
    documents: { count: number; limit: number; percentage: number };
  }> {
    const limits = await this.getLimits(workspaceId);
    const storageUsed = await this.getCurrentStorageUsage(workspaceId);
    const documentCount = await this.getCurrentDocumentCount(workspaceId);

    return {
      storage: {
        used: storageUsed,
        limit: limits.maxStorageBytes,
        percentage: Math.round((storageUsed / limits.maxStorageBytes) * 100),
      },
      documents: {
        count: documentCount,
        limit: limits.maxDocuments,
        percentage: Math.round((documentCount / limits.maxDocuments) * 100),
      },
    };
  }

  private async getLimits(_workspaceId: string): Promise<WorkspaceLimits> {
    // In the future, this can be fetched from database per workspace
    return this.limits;
  }

  private async getCurrentStorageUsage(workspaceId: string): Promise<number> {
    const result = await this.prisma.document.aggregate({
      where: { workspaceId },
      _sum: { fileSize: true },
    });
    return result._sum.fileSize || 0;
  }

  private async getCurrentDocumentCount(workspaceId: string): Promise<number> {
    return this.prisma.document.count({ where: { workspaceId } });
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}
