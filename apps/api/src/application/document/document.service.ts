import { Injectable, NotFoundException, Inject, Logger, BadRequestException, ConflictException } from '@nestjs/common';
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
  DocumentPurpose,
  Prisma,
} from '@prisma/client';
import { WorkspaceLimitsService } from '../workspace/workspace-limits.service';
import { DOMAIN_EVENT_PUBLISHER, IDomainEventPublisher } from '@/domain/shared/domain-event';
import {
  DocumentPurposeChangedEvent,
  DocumentDraftSavedEvent,
  DocumentPublishedEvent,
  DocumentDraftDiscardedEvent,
} from '@/domain/document/events';

interface CreateDocumentDto {
  title: string;
  content?: string;
  contentType?: ContentType;
  sourceDescription?: string;
  verificationStatus?: VerificationStatus;
  tags?: string[];
  purpose?: DocumentPurpose;
}

interface UpdateDocumentDto {
  title?: string;
  content?: string;
  originalFilename?: string;
  sourceDescription?: string;
  verificationStatus?: VerificationStatus;
  tags?: string[];
  purpose?: DocumentPurpose;
  lastKnownUpdatedAt?: string;
}

interface SaveDraftDto {
  title?: string | null;
  content?: string | null;
  sourceDescription?: string;
  verificationStatus?: VerificationStatus;
  tags?: string[];
  purpose?: DocumentPurpose;
  expectedUpdatedAt: string;
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
    @Inject(DOMAIN_EVENT_PUBLISHER)
    private readonly eventPublisher: IDomainEventPublisher,
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

    // Create or find tags (now workspace-scoped)
    const tagRecords = await this.ensureTags(workspaceId, dto.tags || []);

    // Use forWorkspace() to set RLS context for document creation
    const document = await this.prisma.forWorkspace(workspaceId, async (tx) => {
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
          purpose: dto.purpose || DocumentPurpose.KNOWLEDGE,
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
    this.processDocument(document.id, workspaceId).catch(console.error);

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

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
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

      // Add hasDraft to each document for list view
      // Draft content is NOT shown in list (only in findOne with RBAC)
      const documentsWithHasDraft = documents.map((doc) => ({
        ...doc,
        hasDraft: doc.draftContent !== null || doc.draftTitle !== null,
        // Mask draft content in list view (use findOne for full details)
        draftTitle: null,
        draftContent: null,
      }));

      return {
        documents: documentsWithHasDraft,
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
    // Get member info to check role
    const member = await this.workspaceService.ensureMember(workspaceId, userId);

    const document = await this.prisma.forWorkspace(workspaceId, async (tx) => {
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

    // Draft visibility RBAC:
    // - hasDraft, draftUpdatedAt, publishedAt: visible to all roles
    // - draftTitle, draftContent: visible only to OWNER/ADMIN or when user has edit lock
    const isOwnerOrAdmin = member.role === 'OWNER' || member.role === 'ADMIN';
    const hasEditLock = document.editLockedBy === userId;
    const canSeeDraftContent = isOwnerOrAdmin || hasEditLock;

    return {
      ...document,
      hasDraft: document.draftContent !== null || document.draftTitle !== null,
      // Mask draftContent/draftTitle for MEMBER without edit lock
      draftTitle: canSeeDraftContent ? document.draftTitle : null,
      draftContent: canSeeDraftContent ? document.draftContent : null,
    };
  }

  async update(
    workspaceId: string,
    documentId: string,
    userId: string,
    dto: UpdateDocumentDto,
  ) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Handle tags update (now workspace-scoped)
    let tagRecords: { id: string; name: string }[] = [];
    if (dto.tags !== undefined) {
      tagRecords = await this.ensureTags(workspaceId, dto.tags!);
    }

    const result = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, workspaceId },
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // SPEC-018: Validate originalFilename for FILE documents
      if (dto.originalFilename !== undefined) {
        if (document.contentType === ContentType.FILE && dto.originalFilename.trim() === '') {
          throw new BadRequestException('originalFilename cannot be empty for FILE documents');
        }
      }

      // SPEC-018: Reject content edit for FILE documents
      if (dto.content !== undefined && document.contentType === ContentType.FILE) {
        throw new BadRequestException('Content is read-only for FILE documents');
      }

      // SPEC-018: Optimistic locking - conflict detection
      // FIX: Skip conflict check for lock holders as a fallback defense
      // Lock holder owns the document and can safely save even with stale lastKnownUpdatedAt
      if (dto.lastKnownUpdatedAt) {
        const lastKnown = new Date(dto.lastKnownUpdatedAt);
        const isLockHolder = document.editLockedBy === userId;

        if (!isLockHolder && document.updatedAt > lastKnown) {
          throw new ConflictException({
            error: 'CONFLICT',
            serverUpdatedAt: document.updatedAt,
            message: 'Document was modified by another user',
          });
        }
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

      // Track purpose change for audit log
      const purposeChanged = dto.purpose !== undefined && dto.purpose !== document.purpose;
      const oldPurpose = purposeChanged ? document.purpose : null;

      // SPEC-018: Deferred processing - schedule for 1 hour instead of immediate
      const scheduledProcessingAt = needsReprocessing
        ? new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
        : undefined;

      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          title: dto.title,
          content: dto.content,
          originalFilename: dto.originalFilename,
          sourceDescription: dto.sourceDescription,
          verificationStatus: dto.verificationStatus,
          purpose: dto.purpose,
          processingStatus: needsReprocessing ? ProcessingStatus.PENDING : undefined,
          scheduledProcessingAt,
          ...tagsUpdate,
        },
        include: {
          tags: { include: { tag: true } },
        },
      });

      return { updated, needsReprocessing, purposeChanged, oldPurpose };
    });

    // SPEC-018: Do NOT trigger immediate processing for auto-save
    // Processing will happen when:
    // 1. User clicks "Close and index" button (calls triggerProcessing)
    // 2. Scheduled time passes (runner checks scheduledProcessingAt <= NOW())

    // M3: Audit log for purpose changes
    // Emit domain event after transaction commits successfully
    if (result.purposeChanged && result.oldPurpose !== null) {
      const event = new DocumentPurposeChangedEvent(
        documentId,
        workspaceId,
        result.oldPurpose,
        result.updated.purpose,
        userId,
      );
      await this.eventPublisher.publish(event);
      this.logger.log(
        `Document purpose changed: ${documentId} from ${result.oldPurpose} to ${result.updated.purpose} by ${userId}`,
      );
    }

    return result.updated;
  }

  async delete(workspaceId: string, documentId: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const document = await this.prisma.forWorkspace(workspaceId, async (tx) => {
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

    await this.prisma.forWorkspace(workspaceId, async (tx) => {
      await tx.document.delete({
        where: { id: documentId },
      });
    });
  }

  private async processDocument(documentId: string, workspaceId: string) {
    try {
      // Get document content using workspace RLS context
      const doc = await this.prisma.forWorkspace(workspaceId, async (tx) => {
        const document = await tx.document.findUnique({
          where: { id: documentId },
          select: { id: true, content: true, purpose: true },
        });

        if (!document) return null;

        // BUSINESS RULE: Only process KNOWLEDGE documents for RAG indexing
        // INSTRUCTION documents are used in Instruction Sets without semantic search
        if (document.purpose === DocumentPurpose.INSTRUCTION) {
          this.logger.debug(
            `Skipping RAG indexing for INSTRUCTION document ${document.id}`,
          );
          // Mark as completed without processing - no chunks needed for instructions
          await tx.document.update({
            where: { id: documentId },
            data: { processingStatus: ProcessingStatus.COMPLETED },
          });
          return null; // Signal to skip further processing
        }

        // Update status to PROCESSING
        await tx.document.update({
          where: { id: documentId },
          data: { processingStatus: ProcessingStatus.PROCESSING },
        });

        // Delete existing chunks
        await tx.chunk.deleteMany({
          where: { documentId },
        });

        return document;
      });

      if (!doc) return;

      // Chunk the document
      const chunks = await this.chunkingService.chunk(doc.content);

      // Generate embeddings
      const embeddings = await this.embeddingsService.generateEmbeddings(
        chunks.map((c) => c.content),
      );

      // Store chunks with embeddings using RLS context
      await this.prisma.forWorkspace(workspaceId, async (tx) => {
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
      // Error handling - use workspace context
      try {
        await this.prisma.forWorkspace(workspaceId, async (tx) => {
          await tx.document.update({
            where: { id: documentId },
            data: {
              processingStatus: ProcessingStatus.FAILED,
              processingError: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        });
      } catch (updateError) {
        console.error('Failed to update document status:', updateError);
      }
    }
  }

  /**
   * Ensure tags exist in the database.
   * Tags are workspace-scoped - unique per (workspaceId, name).
   */
  private async ensureTags(
    workspaceId: string,
    tagNames: string[],
  ): Promise<{ id: string; name: string }[]> {
    // Normalize tag names: lowercase, alphanumeric + hyphen, trim dashes
    const normalizedNames = tagNames.map((name) =>
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    );

    // Filter out empty strings and too short names
    const validNames = normalizedNames.filter((name) => name.length >= 2);

    if (validNames.length === 0) {
      return [];
    }

    // Use workspace context for RLS
    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      return Promise.all(
        validNames.map((name) =>
          tx.tag.upsert({
            where: {
              workspaceId_name: { workspaceId, name },
            },
            update: {},
            create: { name, workspaceId },
          }),
        ),
      );
    });
  }

  // ============ SPEC-018: Edit Lock Methods ============

  private readonly LOCK_DURATION_MINUTES = 2;

  async acquireLock(workspaceId: string, documentId: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, workspaceId },
        include: {
          editLockedByUser: { select: { email: true } },
        },
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // Check if document is locked by another user
      const isLocked = document.editLockedBy && document.editLockedUntil && document.editLockedUntil > new Date();
      const isLockedByMe = document.editLockedBy === userId;

      if (isLocked && !isLockedByMe) {
        throw new ConflictException({
          error: 'DOCUMENT_LOCKED',
          lockedBy: document.editLockedByUser?.email || 'unknown',
          lockedUntil: document.editLockedUntil,
        });
      }

      const lockedUntil = new Date(Date.now() + this.LOCK_DURATION_MINUTES * 60 * 1000);

      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          editLockedBy: userId,
          editLockedUntil: lockedUntil,
        },
        select: { updatedAt: true },
      });

      // Return updatedAt so frontend can update expectedUpdatedAt
      // This prevents 409 CONFLICT on first save after lock acquisition
      return { lockedUntil, updatedAt: updated.updatedAt };
    });
  }

  async refreshLock(workspaceId: string, documentId: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, workspaceId },
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // Check if lock is held by this user
      if (document.editLockedBy !== userId) {
        throw new ConflictException({
          error: 'LOCK_NOT_HELD',
          message: 'Cannot refresh lock - document is not locked by this user',
        });
      }

      const lockedUntil = new Date(Date.now() + this.LOCK_DURATION_MINUTES * 60 * 1000);

      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          editLockedUntil: lockedUntil,
        },
        select: { updatedAt: true },
      });

      // Return updatedAt so frontend can update expectedUpdatedAt
      // This prevents 409 CONFLICT after heartbeat
      return { lockedUntil, updatedAt: updated.updatedAt };
    });
  }

  async releaseLock(workspaceId: string, documentId: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, workspaceId },
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // Only release if locked by this user
      if (document.editLockedBy !== userId) {
        throw new ConflictException({
          error: 'LOCK_NOT_HELD',
          message: 'Cannot release lock - document is not locked by this user',
        });
      }

      await tx.document.update({
        where: { id: documentId },
        data: {
          editLockedBy: null,
          editLockedUntil: null,
        },
      });
    });
  }

  // ============ SPEC-018: Trigger Processing ============

  async triggerProcessing(workspaceId: string, documentId: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const doc = await tx.document.findFirst({
        where: { id: documentId, workspaceId },
      });

      if (!doc) {
        throw new NotFoundException('Document not found');
      }

      // Set scheduledProcessingAt to now to trigger immediate processing
      await tx.document.update({
        where: { id: documentId },
        data: {
          processingStatus: ProcessingStatus.PENDING,
          scheduledProcessingAt: new Date(),
        },
      });
    });

    // Trigger processing asynchronously
    this.processDocument(documentId, workspaceId).catch(console.error);

    return { message: 'Processing triggered' };
  }

  // ============ Draft/Publish Lifecycle ============

  /**
   * Save draft title and content.
   * Draft is isolated from RAG search and InstructionSets.
   */
  async saveDraft(
    workspaceId: string,
    documentId: string,
    userId: string,
    dto: SaveDraftDto,
  ) {
    await this.workspaceService.ensureEditorOrAdmin(workspaceId, userId);

    let tagRecords: { id: string; name: string }[] = [];
    if (dto.tags !== undefined) {
      tagRecords = await this.ensureTags(workspaceId, dto.tags);
    }

    const result = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, workspaceId },
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // SPEC-018: Check edit lock
      const isLocked = document.editLockedBy && document.editLockedUntil && document.editLockedUntil > new Date();
      const isLockedByMe = document.editLockedBy === userId;

      if (isLocked && !isLockedByMe) {
        throw new ConflictException({
          error: 'DOCUMENT_LOCKED',
          lockedBy: document.editLockedBy,
          lockedUntil: document.editLockedUntil,
        });
      }

      // Optimistic locking check (MANDATORY)
      const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
      if (document.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConflictException({
          error: 'CONFLICT',
          serverUpdatedAt: document.updatedAt,
          message: 'Document was modified by another user',
        });
      }

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

      const purposeChanged = dto.purpose !== undefined && dto.purpose !== document.purpose;
      const oldPurpose = purposeChanged ? document.purpose : null;

      // Save draft
      // IMPORTANT: Only title/content go to draftTitle/draftContent (isolated from RAG)
      // Metadata (verificationStatus, purpose, sourceDescription, tags) updates document.* directly
      // This design ensures metadata is searchable/filterable even when document has unpublished draft
      const now = new Date();
      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          draftTitle: dto.title !== undefined ? dto.title : document.draftTitle,
          draftContent: dto.content !== undefined ? dto.content : document.draftContent,
          draftUpdatedAt: now,
          updatedAt: now,
          // Metadata updates document.* directly (NOT draft.* fields)
          sourceDescription: dto.sourceDescription,
          verificationStatus: dto.verificationStatus,
          purpose: dto.purpose,
          ...tagsUpdate,
        },
      });

      // Emit domain event
      const event = new DocumentDraftSavedEvent(
        documentId,
        workspaceId,
        now,
        updated.draftTitle?.length ?? 0,
        updated.draftContent?.length ?? 0,
        userId,
      );
      await this.eventPublisher.publish(event);

      this.logger.log(`Draft saved for document ${documentId} by ${userId}`);

      return { updated, purposeChanged, oldPurpose };
    });

    if (result.purposeChanged && result.oldPurpose !== null) {
      const event = new DocumentPurposeChangedEvent(
        documentId,
        workspaceId,
        result.oldPurpose,
        result.updated.purpose,
        userId,
      );
      await this.eventPublisher.publish(event);
      this.logger.log(
        `Document purpose changed: ${documentId} from ${result.oldPurpose} to ${result.updated.purpose} by ${userId}`,
      );
    }

    return {
      id: result.updated.id,
      hasDraft: result.updated.draftContent !== null || result.updated.draftTitle !== null,
      draftUpdatedAt: result.updated.draftUpdatedAt,
      updatedAt: result.updated.updatedAt,
    };
  }

  /**
   * Publish draft to production.
   * Triggers processing (chunking/embeddings) if content changed.
   */
  async publishDocument(
    workspaceId: string,
    documentId: string,
    userId: string,
    dto: { expectedUpdatedAt: string },
  ) {
    await this.workspaceService.ensureEditorOrAdmin(workspaceId, userId);

    const result = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, workspaceId },
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // SPEC-018: Check edit lock
      const isLocked = document.editLockedBy && document.editLockedUntil && document.editLockedUntil > new Date();
      const isLockedByMe = document.editLockedBy === userId;

      if (isLocked && !isLockedByMe) {
        throw new ConflictException({
          error: 'DOCUMENT_LOCKED',
          lockedBy: document.editLockedBy,
          lockedUntil: document.editLockedUntil,
        });
      }

      // Optimistic locking check (MANDATORY)
      const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
      if (document.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConflictException({
          error: 'CONFLICT',
          serverUpdatedAt: document.updatedAt,
          message: 'Document was modified by another user',
        });
      }

      // Validation: Must have draft to publish
      const hasDraft = document.draftContent !== null || document.draftTitle !== null;
      if (!hasDraft) {
        throw new BadRequestException('No draft to publish');
      }

      // Check if content/title actually changed
      const contentChanged = document.draftContent !== null && document.draftContent !== document.content;
      const titleChanged = document.draftTitle !== null && document.draftTitle !== document.title;
      const requiresReprocessing = contentChanged;

      // If requires reprocessing, delete old chunks
      if (requiresReprocessing) {
        await tx.chunk.deleteMany({
          where: { documentId },
        });
      }

      // Copy draft to published, clear draft
      // IMPORTANT: Preserve metadata fields (verificationStatus, purpose, sourceDescription, tags)
      // These are already saved via saveDraft endpoint and must persist after publish
      const now = new Date();
      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          title: document.draftTitle !== null ? document.draftTitle : document.title,
          content: document.draftContent !== null ? document.draftContent : document.content,
          draftTitle: null,
          draftContent: null,
          draftUpdatedAt: null,
          publishedAt: now,
          updatedAt: now,
          processingStatus: requiresReprocessing ? ProcessingStatus.PENDING : document.processingStatus,
          scheduledProcessingAt: requiresReprocessing ? now : document.scheduledProcessingAt,
          // NOTE: verificationStatus, purpose, sourceDescription, tags are NOT updated here
          // They persist from saveDraft (already saved to document.* fields, not draft.* fields)
        },
      });

      return {
        updated,
        requiresReprocessing,
        titleChanged,
        contentChanged,
        previousProcessingStatus: document.processingStatus,
      };
    });

    // Emit domain event
    const event = new DocumentPublishedEvent(
      documentId,
      workspaceId,
      result.updated.publishedAt!,
      result.previousProcessingStatus,
      result.requiresReprocessing,
      result.titleChanged,
      result.contentChanged,
      userId,
    );
    await this.eventPublisher.publish(event);

    this.logger.log(
      `Document ${documentId} published by ${userId}. Requires reprocessing: ${result.requiresReprocessing}`,
    );

    // Trigger processing if needed
    if (result.requiresReprocessing) {
      this.processDocument(documentId, workspaceId).catch((error) => {
        this.logger.error(`Failed to process document ${documentId}:`, error);
      });
    }

    return {
      id: result.updated.id,
      hasDraft: false,
      publishedAt: result.updated.publishedAt,
      processingStatus: result.updated.processingStatus,
      updatedAt: result.updated.updatedAt,
    };
  }

  /**
   * Discard draft and return to published version.
   */
  async discardDraft(
    workspaceId: string,
    documentId: string,
    userId: string,
    dto: { expectedUpdatedAt: string },
  ) {
    await this.workspaceService.ensureEditorOrAdmin(workspaceId, userId);

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, workspaceId },
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // SPEC-018: Check edit lock
      const isLocked = document.editLockedBy && document.editLockedUntil && document.editLockedUntil > new Date();
      const isLockedByMe = document.editLockedBy === userId;

      if (isLocked && !isLockedByMe) {
        throw new ConflictException({
          error: 'DOCUMENT_LOCKED',
          lockedBy: document.editLockedBy,
          lockedUntil: document.editLockedUntil,
        });
      }

      // Optimistic locking check (MANDATORY)
      const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
      if (document.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConflictException({
          error: 'CONFLICT',
          serverUpdatedAt: document.updatedAt,
          message: 'Document was modified by another user',
        });
      }

      const hadDraft = document.draftContent !== null || document.draftTitle !== null;

      // Clear draft
      const now = new Date();
      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          draftTitle: null,
          draftContent: null,
          draftUpdatedAt: null,
          updatedAt: now,
        },
      });

      // Emit domain event
      const event = new DocumentDraftDiscardedEvent(
        documentId,
        workspaceId,
        now,
        hadDraft,
        userId,
      );
      await this.eventPublisher.publish(event);

      this.logger.log(`Draft discarded for document ${documentId} by ${userId}`);

      return {
        id: updated.id,
        hasDraft: false,
        title: updated.title,
        content: updated.content,
        updatedAt: updated.updatedAt,
      };
    });
  }
}
