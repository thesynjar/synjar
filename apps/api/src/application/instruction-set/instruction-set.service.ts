import {
  Injectable,
  NotFoundException,
  Inject,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
}

interface ReorderDocumentsDto {
  documentIds: string[];
}

@Injectable()
export class InstructionSetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly configService: ConfigService,
    @Inject(INSTRUCTION_SET_REPOSITORY)
    private readonly repository: IInstructionSetRepository,
  ) {}

  /**
   * List all instruction sets in a workspace
   */
  async findAll(workspaceId: string, userId: string) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const sets = await this.repository.findByWorkspace(workspaceId);
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
  async findOne(id: string, userId: string) {
    const set = await this.repository.findById(id);
    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    // Verify user has access to this workspace
    await this.workspaceService.ensureMember(set.workspaceId, userId);

    return this.toDetailResponse(set);
  }

  /**
   * Create a new instruction set
   */
  async create(workspaceId: string, userId: string, dto: CreateInstructionSetDto) {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Check workspace limit
    const count = await this.repository.countByWorkspace(workspaceId);
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

      // Save to database
      let savedEntity = await this.repository.create(entity);

      // Add initial documents if provided
      if (dto.documentIds?.length) {
        for (let i = 0; i < dto.documentIds.length; i++) {
          const docId = dto.documentIds[i];
          await this.addDocumentInternal(savedEntity, docId, i);
        }
        // Reload to get updated documents
        savedEntity = (await this.repository.findById(savedEntity.id))!;
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
  async update(id: string, userId: string, dto: UpdateInstructionSetDto) {
    const set = await this.repository.findById(id);
    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    await this.workspaceService.ensureMember(set.workspaceId, userId);

    // Optimistic locking check
    if (dto.expectedUpdatedAt) {
      const expectedTime = new Date(dto.expectedUpdatedAt).getTime();
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

      const updated = await this.repository.update(set);
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
  async delete(id: string, userId: string) {
    const set = await this.repository.findById(id);
    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    await this.workspaceService.ensureMember(set.workspaceId, userId);

    await this.repository.delete(id);
  }

  /**
   * Add a document to an instruction set
   */
  async addDocument(instructionSetId: string, userId: string, dto: AddDocumentDto) {
    const set = await this.repository.findById(instructionSetId);
    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    await this.workspaceService.ensureMember(set.workspaceId, userId);

    try {
      const docEntity = await this.addDocumentInternal(set, dto.documentId, set.documentCount);

      return {
        id: docEntity.id,
        documentId: docEntity.documentId,
        order: docEntity.order,
        sizeBytes: docEntity.sizeBytes,
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
    // Get document from database
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        workspaceId: set.workspaceId,
      },
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

    // Persist
    await this.repository.addDocument(set.id, documentId, order);

    return docEntity;
  }

  /**
   * Remove a document from an instruction set
   */
  async removeDocument(instructionSetId: string, documentId: string, userId: string) {
    const set = await this.repository.findById(instructionSetId);
    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    await this.workspaceService.ensureMember(set.workspaceId, userId);

    try {
      set.removeDocument(documentId);
      await this.repository.removeDocument(instructionSetId, documentId);

      // Update orders for remaining documents
      const reorderedDocs = set.documents.map(d => ({
        documentId: d.documentId,
        order: d.order,
      }));
      if (reorderedDocs.length > 0) {
        await this.repository.updateDocumentOrders(instructionSetId, reorderedDocs);
      }
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
  async reorderDocuments(instructionSetId: string, userId: string, dto: ReorderDocumentsDto) {
    const set = await this.repository.findById(instructionSetId);
    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

    await this.workspaceService.ensureMember(set.workspaceId, userId);

    try {
      set.reorderDocuments(dto.documentIds);

      const documentOrders = set.documents.map(d => ({
        documentId: d.documentId,
        order: d.order,
      }));

      await this.repository.updateDocumentOrders(instructionSetId, documentOrders);

      return {
        documents: documentOrders,
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
    const set = await this.repository.findByIdPublic(id);

    // Return 404 for both non-existent and non-public sets (security - prevent enumeration)
    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

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
    const set = await this.repository.findByIdPublic(id);

    if (!set) {
      throw new NotFoundException('Instruction set not found');
    }

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
