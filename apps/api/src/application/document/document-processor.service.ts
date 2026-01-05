import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { ChunkingService } from '../chunking/chunking.service';
import {
  IEmbeddingsService,
  EMBEDDINGS_SERVICE,
} from '@/domain/document/embeddings.port';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '@/domain/document/storage.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  IDomainEventPublisher,
} from '@/domain/shared/domain-event';
import { DocumentProcessedEvent } from '@/domain/document/events';
import {
  IDocumentRepository,
  DOCUMENT_REPOSITORY,
} from '@/domain/document/document.repository';
import { ProcessingStatus } from '@prisma/client';

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkingService: ChunkingService,
    @Inject(EMBEDDINGS_SERVICE)
    private readonly embeddingsService: IEmbeddingsService,
    @Inject(STORAGE_SERVICE)
    _storageService: IStorageService,
    @Inject(DOCUMENT_REPOSITORY)
    _documentRepository: IDocumentRepository,
    @Inject(DOMAIN_EVENT_PUBLISHER)
    private readonly eventPublisher: IDomainEventPublisher,
  ) {}

  async processDocument(
    documentId: string,
    workspaceId: string,
  ): Promise<void> {
    try {
      // All DB operations must run within workspace RLS context
      const document = await this.prisma.forWorkspace(
        workspaceId,
        async (tx) => {
          await tx.document.update({
            where: { id: documentId },
            data: { processingStatus: ProcessingStatus.PROCESSING },
          });

          return tx.document.findUnique({
            where: { id: documentId },
          });
        },
      );

      if (!document) {
        this.logger.warn(`Document ${documentId} not found`);
        return;
      }

      await this.prisma.forWorkspace(workspaceId, async (tx) => {
        await tx.chunk.deleteMany({
          where: { documentId },
        });
      });

      const chunks = await this.createChunks(document.content);
      const embeddedChunks = await this.generateEmbeddings(chunks);
      await this.saveChunks(documentId, workspaceId, embeddedChunks);

      await this.prisma.forWorkspace(workspaceId, async (tx) => {
        await tx.document.update({
          where: { id: documentId },
          data: { processingStatus: ProcessingStatus.COMPLETED },
        });
      });

      await this.publishProcessedEvent(
        document.id,
        document.workspaceId,
        embeddedChunks.length,
      );
    } catch (error) {
      await this.handleProcessingError(documentId, workspaceId, error);
      throw error;
    }
  }

  private async createChunks(content: string) {
    return this.chunkingService.chunk(content);
  }

  private async generateEmbeddings(
    chunks: Array<{
      content: string;
      chunkType?: string;
      metadata?: Record<string, unknown>;
    }>,
  ) {
    const embeddings = await this.embeddingsService.generateEmbeddings(
      chunks.map((c) => c.content),
    );
    return chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] }));
  }

  private async saveChunks(
    documentId: string,
    workspaceId: string,
    chunks: Array<{
      content: string;
      embedding: { embedding: number[]; tokenCount: number };
      chunkType?: string;
      metadata?: Record<string, unknown>;
    }>,
  ) {
    await this.prisma.forWorkspace(workspaceId, async (tx) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        await tx.$executeRaw`
          INSERT INTO "Chunk" (id, "documentId", content, embedding, "chunkIndex", "chunkType", metadata, "createdAt")
          VALUES (
            gen_random_uuid(),
            ${documentId}::uuid,
            ${chunk.content},
            ${JSON.stringify(chunk.embedding.embedding)}::vector,
            ${i},
            ${chunk.chunkType || null},
            ${JSON.stringify(chunk.metadata || {})}::jsonb,
            NOW()
          )
        `;
      }
    });
  }

  private async publishProcessedEvent(
    documentId: string,
    workspaceId: string,
    chunksCount: number,
  ): Promise<void> {
    await this.eventPublisher.publish(
      new DocumentProcessedEvent(documentId, workspaceId, chunksCount),
    );
  }

  private async handleProcessingError(
    documentId: string,
    workspaceId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    this.logger.error(
      `Failed to process document ${documentId}`,
      error instanceof Error ? error.stack : undefined,
    );

    await this.prisma.forWorkspace(workspaceId, async (tx) => {
      await tx.document.update({
        where: { id: documentId },
        data: {
          processingStatus: ProcessingStatus.FAILED,
          processingError: errorMessage,
        },
      });
    });
  }
}
