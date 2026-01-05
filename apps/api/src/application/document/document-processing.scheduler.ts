import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { DocumentProcessorService } from './document-processor.service';
import { ProcessingStatus } from '@prisma/client';

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
   * Processes per workspace with workspace-based RLS context for tenant isolation.
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
      // 2. Get workspaces with pending documents from the queue
      const workspacesWithPending = await this.getWorkspacesWithPendingDocs();

      if (workspacesWithPending.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${workspacesWithPending.length} workspace(s) with pending documents`,
      );

      // 3. Process per workspace (workspace-based RLS context for tenant isolation)
      for (const workspaceId of workspacesWithPending) {
        await this.processWorkspaceDocuments(workspaceId);
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
   * Get workspace IDs that have pending documents.
   * Queries WorkspaceProcessingQueue directly (system table, no RLS).
   */
  private async getWorkspacesWithPendingDocs(): Promise<string[]> {
    // WorkspaceProcessingQueue has RLS disabled - direct query is safe
    const workspaces = await this.prisma.workspaceProcessingQueue.findMany({
      where: {
        pendingDocumentsCount: {
          gt: 0,
        },
      },
      select: {
        workspaceId: true,
      },
      orderBy: {
        // Process workspaces that haven't been processed recently first
        lastProcessedAt: 'asc',
      },
    });

    return workspaces.map((w) => w.workspaceId);
  }

  /**
   * Process pending documents for a specific workspace.
   * Uses forWorkspace() only to fetch documents (RLS isolation),
   * then processes them outside the transaction to avoid timeout.
   */
  private async processWorkspaceDocuments(workspaceId: string): Promise<void> {
    const batchSize = this.configService.get<number>(
      'DOCUMENT_PROCESSING_BATCH_SIZE',
      5,
    );
    const timeoutMs = this.configService.get<number>(
      'DOCUMENT_PROCESSING_TIMEOUT_MS',
      60000,
    );

    // 1. Fetch pending documents with RLS context (short transaction)
    const pendingDocs = await this.prisma.forWorkspace(
      workspaceId,
      async (tx) => {
        return tx.document.findMany({
          where: {
            processingStatus: ProcessingStatus.PENDING,
          },
          select: { id: true, title: true },
          take: batchSize,
          orderBy: { createdAt: 'asc' },
        });
      },
    );

    // 2. Process documents OUTSIDE the transaction (can take a long time)
    for (const doc of pendingDocs) {
      try {
        await this.processWithTimeout(doc.id, workspaceId, timeoutMs);
        this.logger.log(`Processed: ${doc.title} (workspace: ${workspaceId})`);
      } catch (error) {
        this.logger.error(
          `Failed to process document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
        // Continue with next document even if one fails
      }
    }

    // 3. Update last processed timestamp in queue
    await this.prisma.workspaceProcessingQueue.update({
      where: { workspaceId },
      data: { lastProcessedAt: new Date() },
    });
  }

  /**
   * Process document with timeout protection.
   * Prevents stuck processing from blocking the entire scheduler.
   */
  private async processWithTimeout(
    documentId: string,
    workspaceId: string,
    timeoutMs: number,
  ): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Document processing timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    await Promise.race([
      this.documentProcessor.processDocument(documentId, workspaceId),
      timeoutPromise,
    ]);
  }
}
