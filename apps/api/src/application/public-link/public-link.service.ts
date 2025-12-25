import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Prisma, PublicLink } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import {
  IEmbeddingsService,
  EMBEDDINGS_SERVICE,
} from '@/domain/document/embeddings.port';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '@/domain/document/storage.port';
import {
  IPublicLinkRepository,
  PUBLIC_LINK_REPOSITORY,
  PublicLinkWithWorkspace,
} from '@/domain/public-link/public-link.repository';
import { VerificationStatus, ProcessingStatus } from '@prisma/client';

interface CreatePublicLinkDto {
  name?: string;
  allowedTags?: string[];
  expiresAt?: Date;
}

interface PublicSearchDto {
  query?: string;
  tags?: string[];
  limit?: number;
}

@Injectable()
export class PublicLinkService {
  private readonly logger = new Logger(PublicLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    @Inject(PUBLIC_LINK_REPOSITORY)
    private readonly publicLinkRepository: IPublicLinkRepository,
    @Inject(EMBEDDINGS_SERVICE)
    private readonly embeddingsService: IEmbeddingsService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
  ) {}

  private async getSignedFileUrl(fileUrl: string | null): Promise<string | null> {
    if (!fileUrl) return null;

    const key = fileUrl.split('/').pop();
    if (!key) return null;

    // Validate UUID format (files are stored with UUID prefix)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
    if (!uuidRegex.test(key)) {
      return null;
    }

    try {
      return await this.storageService.getSignedUrl(key);
    } catch (error) {
      this.logger.error(`Failed to generate signed URL for key: ${key}`, error);
      return null;
    }
  }

  async create(workspaceId: string, userId: string, dto: CreatePublicLinkDto): Promise<PublicLink> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    // Validate expiration date if provided
    if (dto.expiresAt) {
      const expiresAtDate = new Date(dto.expiresAt);
      if (isNaN(expiresAtDate.getTime())) {
        throw new BadRequestException('Invalid expiration date format');
      }
      if (expiresAtDate <= new Date()) {
        throw new BadRequestException('Expiration date must be in the future');
      }
    }

    // Generate cryptographically secure token (32 bytes = 64 hex chars)
    const token = randomBytes(32).toString('hex');

    return this.publicLinkRepository.createWithUser(userId, {
      workspaceId,
      token,
      name: dto.name,
      allowedTags: dto.allowedTags,
      expiresAt: dto.expiresAt,
    });
  }

  async findAll(workspaceId: string, userId: string): Promise<PublicLink[]> {
    await this.workspaceService.ensureMember(workspaceId, userId);
    return this.publicLinkRepository.findAllWithUser(userId, workspaceId);
  }

  async findOne(workspaceId: string, linkId: string, userId: string): Promise<PublicLink> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const link = await this.publicLinkRepository.findOneWithUser(userId, linkId, workspaceId);

    if (!link) {
      throw new NotFoundException('Public link not found');
    }

    return link;
  }

  async delete(workspaceId: string, linkId: string, userId: string): Promise<void> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const link = await this.publicLinkRepository.findOneWithUser(userId, linkId, workspaceId);

    if (!link) {
      throw new NotFoundException('Public link not found');
    }

    await this.publicLinkRepository.deleteWithUser(userId, linkId);
  }

  async validateToken(token: string): Promise<PublicLinkWithWorkspace> {
    const result = await this.publicLinkRepository.findByTokenWithWorkspace(token);

    if (!result) {
      throw new NotFoundException('Invalid token');
    }

    if (!result.isActive) {
      throw new ForbiddenException('Link is inactive');
    }

    if (result.expiresAt && result.expiresAt < new Date()) {
      throw new ForbiddenException('Link has expired');
    }

    return result;
  }

  async getPublicDocuments(token: string, dto: PublicSearchDto): Promise<{
    workspace: string;
    documents: Array<{
      id: string;
      title: string;
      content: string;
      tags: string[];
      verificationStatus: VerificationStatus;
      fileUrl: string | null;
      createdAt: Date;
    }>;
    totalCount: number;
  }> {
    const link = await this.validateToken(token);
    const ownerId = link.workspace.createdById;

    const limit = dto.limit || 20;

    // Determine allowed tags (intersection of link's tags and requested tags)
    let effectiveTags: string[] | undefined;
    if (link.allowedTags.length > 0) {
      if (dto.tags && dto.tags.length > 0) {
        effectiveTags = dto.tags.filter((t) => link.allowedTags.includes(t));
        if (effectiveTags.length === 0) {
          return { workspace: link.workspace.name, documents: [], totalCount: 0 };
        }
      } else {
        effectiveTags = link.allowedTags;
      }
    } else if (dto.tags && dto.tags.length > 0) {
      effectiveTags = dto.tags;
    }

    const where: Prisma.DocumentWhereInput = {
      workspaceId: link.workspaceId,
      processingStatus: ProcessingStatus.COMPLETED,
      verificationStatus: VerificationStatus.VERIFIED,
      ...(effectiveTags && effectiveTags.length > 0 && {
        tags: {
          some: {
            tag: { name: { in: effectiveTags } },
          },
        },
      }),
    };

    // Use workspace owner as RLS context for public access
    return this.prisma.forUser(ownerId, async (tx) => {
      const [documents, totalCount] = await Promise.all([
        tx.document.findMany({
          where,
          include: {
            tags: { include: { tag: true } },
          },
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.document.count({ where }),
      ]);

      // Generate signed URLs for files
      const documentsWithSignedUrls = await Promise.all(
        documents.map(async (doc) => ({
          id: doc.id,
          title: doc.title,
          content: doc.content,
          tags: doc.tags.map((t) => t.tag.name),
          verificationStatus: doc.verificationStatus,
          fileUrl: await this.getSignedFileUrl(doc.fileUrl),
          createdAt: doc.createdAt,
        })),
      );

      return {
        workspace: link.workspace.name,
        documents: documentsWithSignedUrls,
        totalCount,
      };
    });
  }

  async searchPublic(token: string, dto: PublicSearchDto): Promise<{
    workspace: string;
    results: Array<{
      documentId: string;
      chunkId: string;
      title: string;
      content: string;
      score: number;
      tags: string[];
      fileUrl: string | null;
    }>;
    totalCount: number;
  } | {
    workspace: string;
    documents: Array<{
      id: string;
      title: string;
      content: string;
      tags: string[];
      verificationStatus: VerificationStatus;
      fileUrl: string | null;
      createdAt: Date;
    }>;
    totalCount: number;
  }> {
    const link = await this.validateToken(token);
    const ownerId = link.workspace.createdById;

    if (!dto.query) {
      return this.getPublicDocuments(token, dto);
    }

    const limit = dto.limit || 10;

    // Determine allowed tags
    let effectiveTags: string[] | undefined;
    if (link.allowedTags.length > 0) {
      if (dto.tags && dto.tags.length > 0) {
        effectiveTags = dto.tags.filter((t) => link.allowedTags.includes(t));
        if (effectiveTags.length === 0) {
          return { workspace: link.workspace.name, results: [], totalCount: 0 };
        }
      } else {
        effectiveTags = link.allowedTags;
      }
    } else if (dto.tags && dto.tags.length > 0) {
      effectiveTags = dto.tags;
    }

    // Generate embedding
    const { embedding } = await this.embeddingsService.generateEmbedding(dto.query);

    // Serialize embedding for vector operations
    const embeddingVector = JSON.stringify(embedding);

    // Build tag filter
    const tagFilter = effectiveTags && effectiveTags.length > 0
      ? Prisma.sql`AND d.id IN (
          SELECT dt."documentId" FROM "DocumentTag" dt
          JOIN "Tag" t ON t.id = dt."tagId"
          WHERE t.name IN (${Prisma.join(effectiveTags)})
        )`
      : Prisma.empty;

    // Use workspace owner context for RLS
    return this.prisma.forUser(ownerId, async (tx) => {
      const results = await tx.$queryRaw<
        Array<{
          chunk_id: string;
          document_id: string;
          chunk_content: string;
          score: number;
          title: string;
          file_url: string | null;
        }>
      >`
        SELECT
          c.id as chunk_id,
          d.id as document_id,
          c.content as chunk_content,
          1 - (c.embedding <=> ${embeddingVector}::vector) as score,
          d.title,
          d."fileUrl" as file_url
        FROM "Chunk" c
        JOIN "Document" d ON d.id = c."documentId"
        WHERE d."workspaceId" = ${link.workspaceId}
          AND d."processingStatus" = 'COMPLETED'
          AND d."verificationStatus" = 'VERIFIED'
          ${tagFilter}
        ORDER BY c.embedding <=> ${embeddingVector}::vector
        LIMIT ${limit}
      `;

      // Get tags for documents
      const documentIds = [...new Set(results.map((r) => r.document_id))];
      const documentTags = documentIds.length > 0
        ? await tx.documentTag.findMany({
            where: { documentId: { in: documentIds } },
            include: { tag: true },
          })
        : [];

      const tagsByDocument = new Map<string, string[]>();
      for (const dt of documentTags) {
        const tags = tagsByDocument.get(dt.documentId) || [];
        tags.push(dt.tag.name);
        tagsByDocument.set(dt.documentId, tags);
      }

      // Generate signed URLs for files
      const resultsWithSignedUrls = await Promise.all(
        results.map(async (r) => ({
          documentId: r.document_id,
          chunkId: r.chunk_id,
          title: r.title,
          content: r.chunk_content,
          score: r.score,
          tags: tagsByDocument.get(r.document_id) || [],
          fileUrl: await this.getSignedFileUrl(r.file_url),
        })),
      );

      return {
        workspace: link.workspace.name,
        results: resultsWithSignedUrls,
        totalCount: results.length,
      };
    });
  }
}
