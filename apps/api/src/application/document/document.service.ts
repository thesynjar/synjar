import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
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
  ContentType,
  VerificationStatus,
  ProcessingStatus,
  Prisma,
} from '@prisma/client';
import { WorkspaceLimitsService } from '../workspace/workspace-limits.service';

interface CreateDocumentDto {
  title: string;
  content?: string;
  contentType?: ContentType;
  sourceDescription?: string;
  verificationStatus?: VerificationStatus;
  tags?: string[];
}

interface UpdateDocumentDto {
  title?: string;
  content?: string;
  sourceDescription?: string;
  verificationStatus?: VerificationStatus;
  tags?: string[];
}

interface ListDocumentsQuery {
  tags?: string[];
  verificationStatus?: VerificationStatus;
  processingStatus?: ProcessingStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly chunkingService: ChunkingService,
    private readonly limitsService: WorkspaceLimitsService,
    @Inject(EMBEDDINGS_SERVICE)
    private readonly embeddingsService: IEmbeddingsService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
  ) {}

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateDocumentDto,
    file?: Express.Multer.File,
  ) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    let fileUrl: string | undefined;
    let originalFilename: string | undefined;
    let mimeType: string | undefined;
    let fileSize: number | undefined;
    let content = dto.content || '';
    let contentType = dto.contentType || ContentType.TEXT;

    if (file) {
      await this.limitsService.checkFileSizeLimit(file.size, workspaceId);
      await this.limitsService.checkStorageLimit(workspaceId, file.size);
      await this.limitsService.checkDocumentLimit(workspaceId);

      const uploadResult = await this.storageService.upload(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      fileUrl = uploadResult.url;
      originalFilename = file.originalname;
      mimeType = file.mimetype;
      fileSize = file.size;
      contentType = ContentType.FILE;

      // Extract text from file
      content = await this.chunkingService.parseFile(file.buffer, file.mimetype);
    }

    // Create or find tags (system operation, no RLS needed for tags)
    const tagRecords = await this.prisma.withoutRls(async (tx) => {
      return this.ensureTagsWithTx(tx, dto.tags || []);
    });

    // Use forUser() to set RLS context for document creation
    const document = await this.prisma.forUser(userId, async (tx) => {
      return tx.document.create({
        data: {
          workspaceId,
          title: dto.title,
          content,
          contentType,
          originalFilename,
          fileUrl,
          mimeType,
          fileSize,
          sourceDescription: dto.sourceDescription,
          verificationStatus: dto.verificationStatus || VerificationStatus.UNVERIFIED,
          processingStatus: ProcessingStatus.PENDING,
          tags: {
            create: tagRecords.map((tag) => ({
              tagId: tag.id,
            })),
          },
        },
        include: {
          tags: { include: { tag: true } },
        },
      });
    });

    // Process document asynchronously (in real app, use queue)
    this.processDocument(document.id).catch(console.error);

    return document;
  }

  async findAll(workspaceId: string, userId: string, query: ListDocumentsQuery) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentWhereInput = { workspaceId };

    if (query.verificationStatus) {
      where.verificationStatus = query.verificationStatus;
    }

    if (query.processingStatus) {
      where.processingStatus = query.processingStatus;
    }

    if (query.tags && query.tags.length > 0) {
      where.tags = {
        some: {
          tag: {
            name: { in: query.tags },
          },
        },
      };
    }

    return this.prisma.forUser(userId, async (tx) => {
      const [documents, total] = await Promise.all([
        tx.document.findMany({
          where,
          include: {
            tags: { include: { tag: true } },
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.document.count({ where }),
      ]);

      return {
        documents,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  async findOne(workspaceId: string, documentId: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const document = await this.prisma.forUser(userId, async (tx) => {
      return tx.document.findFirst({
        where: { id: documentId, workspaceId },
        include: {
          tags: { include: { tag: true } },
          chunks: {
            select: {
              id: true,
              chunkIndex: true,
              chunkType: true,
              content: true,
            },
          },
        },
      });
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async update(
    workspaceId: string,
    documentId: string,
    userId: string,
    dto: UpdateDocumentDto,
  ) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Handle tags update (system operation)
    let tagRecords: { id: string; name: string }[] = [];
    if (dto.tags !== undefined) {
      tagRecords = await this.prisma.withoutRls(async (tx) => {
        return this.ensureTagsWithTx(tx, dto.tags!);
      });
    }

    const result = await this.prisma.forUser(userId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, workspaceId },
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // Handle tags update
      let tagsUpdate = {};
      if (dto.tags !== undefined) {
        tagsUpdate = {
          tags: {
            deleteMany: {},
            create: tagRecords.map((tag) => ({
              tagId: tag.id,
            })),
          },
        };
      }

      const needsReprocessing = dto.content !== undefined && dto.content !== document.content;

      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          title: dto.title,
          content: dto.content,
          sourceDescription: dto.sourceDescription,
          verificationStatus: dto.verificationStatus,
          processingStatus: needsReprocessing ? ProcessingStatus.PENDING : undefined,
          ...tagsUpdate,
        },
        include: {
          tags: { include: { tag: true } },
        },
      });

      return { updated, needsReprocessing };
    });

    if (result.needsReprocessing) {
      this.processDocument(documentId).catch(console.error);
    }

    return result.updated;
  }

  async delete(workspaceId: string, documentId: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const document = await this.prisma.forUser(userId, async (tx) => {
      return tx.document.findFirst({
        where: { id: documentId, workspaceId },
      });
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Delete file from storage if exists
    if (document.fileUrl) {
      const key = document.fileUrl.split('/').pop();
      if (!key) {
        this.logger.warn(`Invalid file URL format: ${document.fileUrl}`);
      } else {
        // Validate UUID format (files are stored with UUID prefix)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
        if (!uuidRegex.test(key)) {
          this.logger.warn(`Invalid file key format: ${key}`);
        } else {
          try {
            await this.storageService.delete(key);
          } catch (error) {
            this.logger.error(`Failed to delete file from storage: ${key}`, error);
          }
        }
      }
    }

    await this.prisma.forUser(userId, async (tx) => {
      await tx.document.delete({
        where: { id: documentId },
      });
    });
  }

  private async processDocument(documentId: string) {
    try {
      // First, get document with workspace to find the owner for RLS context
      // Using withoutRls to bypass RLS for initial lookup
      const lookupResult = await this.prisma.withoutRls(async (tx) => {
        const doc = await tx.document.findUnique({
          where: { id: documentId },
          select: { id: true, workspaceId: true, content: true },
        });

        if (!doc) return null;

        const workspace = await tx.workspace.findUnique({
          where: { id: doc.workspaceId },
          select: { createdById: true },
        });

        if (!workspace) return null;

        return { doc, ownerId: workspace.createdById };
      });

      if (!lookupResult) return;
      const { doc, ownerId } = lookupResult;

      // Now process with proper RLS context using workspace owner
      await this.prisma.forUser(ownerId, async (tx) => {
        await tx.document.update({
          where: { id: documentId },
          data: { processingStatus: ProcessingStatus.PROCESSING },
        });

        // Delete existing chunks
        await tx.chunk.deleteMany({
          where: { documentId },
        });
      });

      // Chunk the document
      const chunks = await this.chunkingService.chunk(doc.content);

      // Generate embeddings
      const embeddings = await this.embeddingsService.generateEmbeddings(
        chunks.map((c) => c.content),
      );

      // Store chunks with embeddings using RLS context
      await this.prisma.forUser(ownerId, async (tx) => {
        // Store chunks with embeddings using raw SQL (for vector type)
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = embeddings[i];
          const chunkId = crypto.randomUUID();

          await tx.$executeRaw`
            INSERT INTO "Chunk" (id, "documentId", content, embedding, "chunkIndex", "chunkType", metadata, "createdAt")
            VALUES (
              ${chunkId},
              ${documentId},
              ${chunk.content},
              ${JSON.stringify(embedding.embedding)}::vector,
              ${i},
              ${chunk.chunkType || null},
              ${JSON.stringify(chunk.metadata || {})}::jsonb,
              NOW()
            )
          `;
        }

        await tx.document.update({
          where: { id: documentId },
          data: { processingStatus: ProcessingStatus.COMPLETED },
        });
      });
    } catch (error) {
      console.error('Document processing failed:', error);
      // Error handling - update document directly
      try {
        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            processingStatus: ProcessingStatus.FAILED,
            processingError: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch (updateError) {
        console.error('Failed to update document status:', updateError);
      }
    }
  }

  private async ensureTagsWithTx(
    tx: Parameters<Parameters<typeof this.prisma.forUser>[1]>[0],
    tagNames: string[],
  ) {
    const normalizedNames = tagNames.map((name) =>
      name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    );

    const tags = await Promise.all(
      normalizedNames.map((name) =>
        tx.tag.upsert({
          where: { name },
          update: {},
          create: { name },
        }),
      ),
    );

    return tags;
  }
}
