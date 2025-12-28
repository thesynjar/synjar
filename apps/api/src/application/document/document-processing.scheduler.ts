import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { DocumentProcessorService } from './document-processor.service';
import { ProcessingStatus } from '@prisma/client';

interface WorkspaceWithOwner {
  id: string;
  createdById: string;
}

@Injectable()
export class DocumentProcessingScheduler {
  private readonly logger = new Logger(DocumentProcessingScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentProcessor: DocumentProcessorService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Process pending documents every 10 seconds.
   * Uses PostgreSQL advisory lock for multi-instance safety (Cloud deployment).
   * Processes per workspace with RLS context for tenant isolation.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingDocuments(): Promise<void> {
    // 1. Try to acquire distributed lock (PostgreSQL advisory lock)
    const lockAcquired = await this.tryAcquireLock();
    if (!lockAcquired) {
      // Another instance is already processing
      return;
    }

    try {
      // 2. Get workspaces with pending documents
      const workspacesWithPending = await this.getWorkspacesWithPendingDocs();

      if (workspacesWithPending.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${workspacesWithPending.length} workspace(s) with pending documents`,
      );

      // 3. Process per workspace (RLS context for tenant isolation)
      for (const workspace of workspacesWithPending) {
        await this.processWorkspaceDocuments(workspace);
      }
    } catch (error) {
      this.logger.error(
        `Scheduler error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      // 4. Always release lock
      await this.releaseLock();
    }
  }

  /**
   * Try to acquire PostgreSQL advisory lock.
   * Non-blocking - returns immediately if lock is held by another process.
   */
  private async tryAcquireLock(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<
        [{ pg_try_advisory_lock: boolean }]
      >`SELECT pg_try_advisory_lock(hashtext('document-processing-scheduler'))`;
      return result[0].pg_try_advisory_lock;
    } catch (error) {
      this.logger.error(
        `Failed to acquire lock: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      return false;
    }
  }

  /**
   * Release PostgreSQL advisory lock.
   */
  private async releaseLock(): Promise<void> {
    try {
      await this.prisma
        .$queryRaw`SELECT pg_advisory_unlock(hashtext('document-processing-scheduler'))`;
    } catch (error) {
      this.logger.error(
        `Failed to release lock: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  /**
   * Get unique workspaces that have pending documents.
   * Uses raw query to bypass RLS (this is a system-level operation).
   */
  private async getWorkspacesWithPendingDocs(): Promise<WorkspaceWithOwner[]> {
    // Use withoutRls for system-level query (finding which workspaces need processing)
    return this.prisma.withoutRls(async (tx) => {
      const workspaces = await tx.workspace.findMany({
        where: {
          documents: {
            some: {
              processingStatus: ProcessingStatus.PENDING,
            },
          },
        },
        select: {
          id: true,
          createdById: true,
        },
      });
      return workspaces;
    });
  }

  /**
   * Process pending documents for a specific workspace.
   * Uses forUser() to enforce RLS context (tenant isolation).
   */
  private async processWorkspaceDocuments(
    workspace: WorkspaceWithOwner,
  ): Promise<void> {
    const batchSize = this.configService.get<number>(
      'DOCUMENT_PROCESSING_BATCH_SIZE',
      5,
    );
    const timeoutMs = this.configService.get<number>(
      'DOCUMENT_PROCESSING_TIMEOUT_MS',
      60000,
    );

    // Process with RLS context (tenant isolation)
    await this.prisma.forUser(workspace.createdById, async (tx) => {
      const pendingDocs = await tx.document.findMany({
        where: {
          workspaceId: workspace.id,
          processingStatus: ProcessingStatus.PENDING,
        },
        select: { id: true, title: true },
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });

      for (const doc of pendingDocs) {
        try {
          await this.processWithTimeout(doc.id, timeoutMs);
          this.logger.log(`Processed: ${doc.title} (workspace: ${workspace.id})`);
        } catch (error) {
          this.logger.error(
            `Failed to process document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
          // Continue with next document even if one fails
        }
      }
    });
  }

  /**
   * Process document with timeout protection.
   * Prevents stuck processing from blocking the entire scheduler.
   */
  private async processWithTimeout(
    documentId: string,
    timeoutMs: number,
  ): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Document processing timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    await Promise.race([
      this.documentProcessor.processDocument(documentId),
      timeoutPromise,
    ]);
  }
}
