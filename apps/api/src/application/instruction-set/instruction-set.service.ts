import {
  Injectable,
  NotFoundException,
  Inject,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validate as isUUID } from 'uuid';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import {
  InstructionSetEntity,
  MAX_SETS_PER_WORKSPACE,
} from '@/domain/instruction-set/instruction-set.entity';
import {
  IInstructionSetRepository,
  INSTRUCTION_SET_REPOSITORY,
} from '@/domain/instruction-set/instruction-set.repository';
import {
  DocumentAlreadyInSetError,
  DocumentLimitExceededError,
  DocumentNotInSetError,
  InvalidInstructionSetNameError,
  SizeLimitExceededError,
} from '@/domain/instruction-set/errors';

interface CreateInstructionSetDto {
  name: string;
  description?: string;
  documentIds?: string[];
}

interface UpdateInstructionSetDto {
  name?: string;
  description?: string;
  isPublic?: boolean;
  expectedUpdatedAt?: string;
}

interface AddDocumentDto {
  documentId: string;
  expectedUpdatedAt?: string;
}

interface ReorderDocumentsDto {
  documentIds: string[];
  expectedUpdatedAt?: string;
}

interface RemoveDocumentDto {
  expectedUpdatedAt?: string;
}

@Injectable()
export class InstructionSetService {
  private readonly logger = new Logger(InstructionSetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly configService: ConfigService,
    @Inject(INSTRUCTION_SET_REPOSITORY)
    private readonly repository: IInstructionSetRepository,
  ) {}

  /**
   * Check for optimistic locking conflict.
   * If expectedUpdatedAt is provided and does not match current updatedAt, throws 409 Conflict.
   * If expectedUpdatedAt is not provided, allows the operation (backward compatibility).
   */
  private checkOptimisticLock(set: InstructionSetEntity, expectedUpdatedAt?: string): void {
    if (expectedUpdatedAt) {
      const expectedTime = new Date(expectedUpdatedAt).getTime();
      const actualTime = set.updatedAt.getTime();
      if (actualTime !== expectedTime) {
        throw new ConflictException({
          error: {
            code: 'CONFLICT',
            message: 'Ten zestaw został zmodyfikowany przez innego użytkownika.',
            details: {
              lastModifiedAt: set.updatedAt.toISOString(),
            },
            suggestion: 'Odśwież stronę, aby zobaczyć zmiany.',
          },
        });
      }
    }
  }

  /**
   * Maps Prisma data to InstructionSetEntity.
   * Centralizes the mapping logic to avoid DRY violations.
   */
  private mapToEntity(data: {
    id: string;
    workspaceId: string;
    name: string;
    description: string | null;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    documents: Array<{
      id: string;
      instructionSetId: string;
      documentId: string;
      order: number;
      document: {
        id: string;
        title: string;
        content: string;
        fileUrl: string | null;
      };
    }>;
  }): InstructionSetEntity {
    return InstructionSetEntity.reconstitute({
      id: data.id,
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description,
      isPublic: data.isPublic,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      documents: data.documents.map(d => ({
        id: d.id,
        instructionSetId: d.instructionSetId,
        documentId: d.documentId,
        order: d.order,
        title: d.document.title,
        content: d.document.content,
        sizeBytes: Buffer.byteLength(d.document.content, 'utf8'),
        fileUrl: d.document.fileUrl,
      })),
    });
  }

  /**
   * List all instruction sets in a workspace
   */
  async findAll(workspaceId: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Use forWorkspace for RLS context
    const sets = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const data = await tx.instructionSet.findMany({
        where: { workspaceId },
        include: {
          documents: {
            include: {
              document: {
                select: {
                  id: true,
                  title: true,
                  content: true,
                  fileUrl: true,
                  verificationStatus: true,
                  purpose: true,
                },
              },
            },
            orderBy: { order: 'asc' as const },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return data.map(d => this.mapToEntity(d));
    });

    const count = sets.length;
    const limit = MAX_SETS_PER_WORKSPACE;

    return {
      data: sets.map(set => this.toResponse(set)),
      meta: {
        count,
        limit,
        remaining: limit - count,
      },
    };
  }

  /**
   * Get a single instruction set by ID
   */
  async findOne(workspaceId: string, id: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const set = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const data = await tx.instructionSet.findUnique({
        where: { id },
        include: {
          documents: {
            include: {
              document: {
                select: {
                  id: true,
                  title: true,
                  content: true,
                  fileUrl: true,
                  verificationStatus: true,
                  purpose: true,
                },
              },
            },
            orderBy: { order: 'asc' as const },
          },
        },
      });
      if (!data) return null;
      return this.mapToEntity(data);
    });

    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    return this.toDetailResponse(set);
  }

  /**
   * Create a new instruction set
   */
  async create(workspaceId: string, userId: string, dto: CreateInstructionSetDto) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Check workspace limit with RLS context
    const count = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      return tx.instructionSet.count({ where: { workspaceId } });
    });
    if (count >= MAX_SETS_PER_WORKSPACE) {
      throw new BadRequestException({
        error: {
          code: 'WORKSPACE_LIMIT_EXCEEDED',
          message: `Workspace has reached the limit of ${MAX_SETS_PER_WORKSPACE} instruction sets`,
          details: { currentCount: count, limit: MAX_SETS_PER_WORKSPACE },
          suggestion: 'Remove unused instruction sets before creating new ones',
        },
      });
    }

    try {
      // Create the entity
      const entity = InstructionSetEntity.create({
        workspaceId,
        name: dto.name,
        description: dto.description,
      });

      // Save to database with RLS context
      // Use forWorkspace() to set workspace context for INSERT policy
      let savedEntity = await this.prisma.forWorkspace(workspaceId, async (tx) => {
        const data = await tx.instructionSet.create({
          data: {
            workspaceId: entity.workspaceId,
            name: entity.name,
            description: entity.description,
            isPublic: entity.isPublic,
          },
          include: {
            documents: {
              include: {
                document: {
                  select: {
                    id: true,
                    title: true,
                    content: true,
                    fileUrl: true,
                    verificationStatus: true,
                    purpose: true,
                  },
                },
              },
              orderBy: { order: 'asc' as const },
            },
          },
        });
        return this.mapToEntity(data);
      });

      // Add initial documents if provided
      if (dto.documentIds?.length) {
        for (let i = 0; i < dto.documentIds.length; i++) {
          const docId = dto.documentIds[i];
          await this.addDocumentInternal(savedEntity, docId, i);
        }
        // Reload to get updated documents with RLS context
        const reloaded = await this.prisma.forWorkspace(workspaceId, async (tx) => {
          const data = await tx.instructionSet.findUnique({
            where: { id: savedEntity.id },
            include: {
              documents: {
                include: {
                  document: {
                    select: {
                      id: true,
                      title: true,
                      content: true,
                      fileUrl: true,
                      verificationStatus: true,
                      purpose: true,
                    },
                  },
                },
                orderBy: { order: 'asc' as const },
              },
            },
          });
          if (!data) return null;
          return this.mapToEntity(data);
        });
        if (reloaded) {
          savedEntity = reloaded;
        }
      }

      return this.toResponse(savedEntity);
    } catch (error) {
      if (error instanceof InvalidInstructionSetNameError) {
        throw new BadRequestException({
          error: {
            code: error.code,
            message: error.message,
            suggestion: error.suggestion,
          },
        });
      }
      throw error;
    }
  }

  /**
   * Update an instruction set
   */
  async update(workspaceId: string, id: string, userId: string, dto: UpdateInstructionSetDto) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Find with RLS context
    const set = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const data = await tx.instructionSet.findUnique({
        where: { id },
        include: {
          documents: {
            include: {
              document: {
                select: {
                  id: true,
                  title: true,
                  content: true,
                  fileUrl: true,
                  verificationStatus: true,
                  purpose: true,
                },
              },
            },
            orderBy: { order: 'asc' as const },
          },
        },
      });
      if (!data) return null;
      return this.mapToEntity(data);
    });

    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    // Optimistic locking check
    this.checkOptimisticLock(set, dto.expectedUpdatedAt);

    try {
      if (dto.name !== undefined) {
        set.updateName(dto.name);
      }
      if (dto.description !== undefined) {
        set.updateDescription(dto.description);
      }
      if (dto.isPublic !== undefined) {
        set.setPublic(dto.isPublic);
      }

      // Update with RLS context
      const updated = await this.prisma.forWorkspace(set.workspaceId, async (tx) => {
        const data = await tx.instructionSet.update({
          where: { id: set.id },
          data: {
            name: set.name,
            description: set.description,
            isPublic: set.isPublic,
          },
          include: {
            documents: {
              include: {
                document: {
                  select: {
                    id: true,
                    title: true,
                    content: true,
                    fileUrl: true,
                    verificationStatus: true,
                    purpose: true,
                  },
                },
              },
              orderBy: { order: 'asc' as const },
            },
          },
        });
        return this.mapToEntity(data);
      });

      return this.toDetailResponse(updated);
    } catch (error) {
      if (error instanceof InvalidInstructionSetNameError) {
        throw new BadRequestException({
          error: {
            code: error.code,
            message: error.message,
            suggestion: error.suggestion,
          },
        });
      }
      throw error;
    }
  }

  /**
   * Delete an instruction set
   */
  async delete(workspaceId: string, id: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Check if exists with RLS context
    const exists = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const data = await tx.instructionSet.findUnique({
        where: { id },
        select: { id: true },
      });
      return !!data;
    });

    if (!exists) {
      throw new NotFoundException('Instruction set not found');
    }

    // Delete with RLS context
    await this.prisma.forWorkspace(workspaceId, async (tx) => {
      await tx.instructionSet.delete({ where: { id } });
    });
  }

  /**
   * Add a document to an instruction set
   */
  async addDocument(workspaceId: string, instructionSetId: string, userId: string, dto: AddDocumentDto) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Find with RLS context
    const set = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const data = await tx.instructionSet.findUnique({
        where: { id: instructionSetId },
        include: {
          documents: {
            include: {
              document: {
                select: { id: true, title: true, content: true, fileUrl: true, verificationStatus: true, purpose: true },
              },
            },
            orderBy: { order: 'asc' as const },
          },
        },
      });
      if (!data) return null;
      return this.mapToEntity(data);
    });

    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    // Optimistic locking check
    this.checkOptimisticLock(set, dto.expectedUpdatedAt);

    try {
      const docEntity = await this.addDocumentInternal(set, dto.documentId, set.documentCount);

      // Reload to get updated timestamp
      const updatedAt = await this.prisma.forWorkspace(workspaceId, async (tx) => {
        const data = await tx.instructionSet.findUnique({
          where: { id: set.id },
          select: { updatedAt: true },
        });
        return data?.updatedAt ?? new Date();
      });

      return {
        id: docEntity.id,
        documentId: docEntity.documentId,
        order: docEntity.order,
        sizeBytes: docEntity.sizeBytes,
        updatedAt,
      };
    } catch (error) {
      if (error instanceof DocumentAlreadyInSetError) {
        throw new ConflictException({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }
      if (error instanceof SizeLimitExceededError || error instanceof DocumentLimitExceededError) {
        throw new BadRequestException({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            suggestion: error.suggestion,
          },
        });
      }
      throw error;
    }
  }

  private async addDocumentInternal(set: InstructionSetEntity, documentId: string, order: number) {
    // Get document from database with RLS context
    const document = await this.prisma.forWorkspace(set.workspaceId, async (tx) => {
      return tx.document.findFirst({
        where: {
          id: documentId,
          workspaceId: set.workspaceId,
        },
      });
    });

    if (!document) {
      throw new NotFoundException({
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found in this workspace',
          details: { documentId },
        },
      });
    }

    // Calculate size
    const sizeBytes = Buffer.byteLength(document.content, 'utf8');

    // Add to domain entity (validates invariants)
    const docEntity = set.addDocument({
      documentId: document.id,
      title: document.title,
      content: document.content,
      sizeBytes,
      fileUrl: document.fileUrl,
    });

    // Persist with RLS context
    await this.prisma.forWorkspace(set.workspaceId, async (tx) => {
      await tx.instructionSetDocument.create({
        data: {
          instructionSetId: set.id,
          documentId,
          order,
        },
      });
    });

    return docEntity;
  }

  /**
   * Remove a document from an instruction set
   */
  async removeDocument(
    workspaceId: string,
    instructionSetId: string,
    documentId: string,
    userId: string,
    dto?: RemoveDocumentDto,
  ) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Find with RLS context
    const set = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const data = await tx.instructionSet.findUnique({
        where: { id: instructionSetId },
        include: {
          documents: {
            include: {
              document: {
                select: { id: true, title: true, content: true, fileUrl: true, verificationStatus: true, purpose: true },
              },
            },
            orderBy: { order: 'asc' as const },
          },
        },
      });
      if (!data) return null;
      return this.mapToEntity(data);
    });

    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    // Optimistic locking check
    this.checkOptimisticLock(set, dto?.expectedUpdatedAt);

    try {
      set.removeDocument(documentId);

      // Remove document and update orders with RLS context
      await this.prisma.forWorkspace(set.workspaceId, async (tx) => {
        // Remove the document
        await tx.instructionSetDocument.deleteMany({
          where: {
            instructionSetId,
            documentId,
          },
        });

        // Update orders for remaining documents
        const reorderedDocs = set.documents.map(d => ({
          documentId: d.documentId,
          order: d.order,
        }));

        // Update each document's order in a batch
        for (const doc of reorderedDocs) {
          await tx.instructionSetDocument.updateMany({
            where: { instructionSetId, documentId: doc.documentId },
            data: { order: doc.order },
          });
        }
      });
    } catch (error) {
      if (error instanceof DocumentNotInSetError) {
        throw new NotFoundException({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }
      throw error;
    }
  }

  /**
   * Reorder documents in an instruction set
   */
  async reorderDocuments(workspaceId: string, instructionSetId: string, userId: string, dto: ReorderDocumentsDto) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Find with RLS context
    const set = await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const data = await tx.instructionSet.findUnique({
        where: { id: instructionSetId },
        include: {
          documents: {
            include: {
              document: {
                select: { id: true, title: true, content: true, fileUrl: true, verificationStatus: true, purpose: true },
              },
            },
            orderBy: { order: 'asc' as const },
          },
        },
      });
      if (!data) return null;
      return this.mapToEntity(data);
    });

    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    // Optimistic locking check
    this.checkOptimisticLock(set, dto.expectedUpdatedAt);

    try {
      set.reorderDocuments(dto.documentIds);

      const documentOrders = set.documents.map(d => ({
        documentId: d.documentId,
        order: d.order,
      }));

      // Update orders with RLS context
      await this.prisma.forWorkspace(workspaceId, async (tx) => {
        for (const doc of documentOrders) {
          await tx.instructionSetDocument.updateMany({
            where: { instructionSetId, documentId: doc.documentId },
            data: { order: doc.order },
          });
        }
      });

      // Reload to get updated timestamp
      const updatedAt = await this.prisma.forWorkspace(workspaceId, async (tx) => {
        const data = await tx.instructionSet.findUnique({
          where: { id: instructionSetId },
          select: { updatedAt: true },
        });
        return data?.updatedAt ?? new Date();
      });

      return {
        documents: documentOrders,
        updatedAt,
      };
    } catch (error) {
      if (error instanceof DocumentNotInSetError) {
        throw new BadRequestException({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }
      throw error;
    }
  }

  /**
   * Get public set content (no authentication required)
   */
  async getPublicContent(id: string) {
    // Validate UUID format to avoid unnecessary DB queries
    if (!isUUID(id)) {
      this.logger.log({
        event: 'PUBLIC_INSTRUCTION_SET_ACCESS_DENIED',
        instructionSetId: id,
        reason: 'invalid_uuid_format',
        timestamp: new Date().toISOString(),
      });
      throw new NotFoundException('Instruction set not found');
    }

    const set = await this.repository.findByIdPublic(id);

    // Return 404 for both non-existent and non-public sets (security - prevent enumeration)
    if (!set) {
      this.logger.log({
        event: 'PUBLIC_INSTRUCTION_SET_ACCESS_DENIED',
        instructionSetId: id,
        reason: 'not_found_or_not_public',
        timestamp: new Date().toISOString(),
      });
      throw new NotFoundException('Instruction set not found');
    }

    // Audit log for successful public access
    this.logger.log({
      event: 'PUBLIC_INSTRUCTION_SET_ACCESS',
      instructionSetId: set.id,
      workspaceId: set.workspaceId,
      documentCount: set.documentCount,
      totalSizeBytes: set.totalSizeBytes,
      format: 'json',
      timestamp: new Date().toISOString(),
    });

    return {
      id: set.id,
      name: set.name,
      description: set.description,
      documents: set.documents.map(d => ({
        title: d.title ?? 'Untitled',
        content: d.content ?? '',
        sourceUrl: d.fileUrl ?? null,
        order: d.order,
      })),
      content: set.getCombinedContent(),
      totalSizeBytes: set.totalSizeBytes,
      tokenEstimate: set.tokenEstimate,
      updatedAt: set.updatedAt,
    };
  }

  /**
   * Get raw content for LLM agents (text/plain)
   */
  async getRawContent(id: string): Promise<string> {
    // Validate UUID format to avoid unnecessary DB queries
    if (!isUUID(id)) {
      this.logger.log({
        event: 'PUBLIC_INSTRUCTION_SET_ACCESS_DENIED',
        instructionSetId: id,
        reason: 'invalid_uuid_format',
        timestamp: new Date().toISOString(),
      });
      throw new NotFoundException('Instruction set not found');
    }

    const set = await this.repository.findByIdPublic(id);

    if (!set) {
      this.logger.log({
        event: 'PUBLIC_INSTRUCTION_SET_ACCESS_DENIED',
        instructionSetId: id,
        reason: 'not_found_or_not_public',
        timestamp: new Date().toISOString(),
      });
      throw new NotFoundException('Instruction set not found');
    }

    // Audit log for successful public access
    this.logger.log({
      event: 'PUBLIC_INSTRUCTION_SET_ACCESS',
      instructionSetId: set.id,
      workspaceId: set.workspaceId,
      documentCount: set.documentCount,
      totalSizeBytes: set.totalSizeBytes,
      format: 'raw',
      timestamp: new Date().toISOString(),
    });

    return set.getCombinedContent();
  }

  // Response mappers
  private toResponse(set: InstructionSetEntity) {
    return {
      id: set.id,
      name: set.name,
      description: set.description,
      isPublic: set.isPublic,
      publicUrl: set.isPublic ? this.buildPublicUrl(set.id) : null,
      documentCount: set.documentCount,
      totalSizeBytes: set.totalSizeBytes,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
    };
  }

  private toDetailResponse(set: InstructionSetEntity) {
    return {
      id: set.id,
      name: set.name,
      description: set.description,
      isPublic: set.isPublic,
      publicUrl: set.isPublic ? this.buildPublicUrl(set.id) : null,
      documents: set.documents.map(d => ({
        id: d.id,
        documentId: d.documentId,
        title: d.title,
        sizeBytes: d.sizeBytes,
        order: d.order,
      })),
      totalSizeBytes: set.totalSizeBytes,
      tokenEstimate: set.tokenEstimate,
      sizeStatus: set.sizeStatus,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
    };
  }

  private buildPublicUrl(id: string): string {
    // API_BASE_URL should be set in production (e.g., https://api.synjar.com)
    // Falls back to localhost for development
    const port = this.configService.get<string>('PORT', '6200');
    const baseUrl = this.configService.get<string>('API_BASE_URL', `http://localhost:${port}`);
    return `${baseUrl}/s/${id}`;
  }
}
