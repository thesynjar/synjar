import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';

interface TagDto {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
}

interface TagWithCountDto extends TagDto {
  documentCount: number;
}

interface TagSuggestionDto {
  id: string;
  name: string;
  documentCount: number;
}

interface CreateTagDto {
  name: string;
}

interface UpdateTagDto {
  name: string;
}

const MAX_TAGS_PER_WORKSPACE = 500;
const MIN_TAG_LENGTH = 2;
const MAX_TAG_LENGTH = 50;

@Injectable()
export class TagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  /**
   * List all tags in a workspace with document count.
   */
  async findAll(
    workspaceId: string,
    userId: string,
  ): Promise<TagWithCountDto[]> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      const tags = await tx.tag.findMany({
        where: { workspaceId },
        include: {
          _count: { select: { documents: true } },
        },
        orderBy: { name: 'asc' },
      });

      return tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        workspaceId: tag.workspaceId,
        createdAt: tag.createdAt.toISOString(),
        documentCount: tag._count.documents,
      }));
    });
  }

  /**
   * Autocomplete search for tag input.
   */
  async autocomplete(
    workspaceId: string,
    userId: string,
    query: string,
  ): Promise<TagSuggestionDto[]> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const normalizedQuery = this.normalizeTagName(query);

    // Return empty if query is empty
    if (!normalizedQuery) {
      return this.prisma.forWorkspace(workspaceId, async (tx) => {
        const tags = await tx.tag.findMany({
          where: { workspaceId },
          include: {
            _count: { select: { documents: true } },
          },
          orderBy: [
            { documents: { _count: 'desc' } },
            { name: 'asc' },
          ],
          take: 10,
        });

        return tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          documentCount: tag._count.documents,
        }));
      });
    }

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      const tags = await tx.tag.findMany({
        where: {
          workspaceId,
          name: { contains: normalizedQuery },
        },
        include: {
          _count: { select: { documents: true } },
        },
        orderBy: [
          { documents: { _count: 'desc' } },
          { name: 'asc' },
        ],
        take: 10,
      });

      return tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        documentCount: tag._count.documents,
      }));
    });
  }

  /**
   * Create a new tag explicitly.
   */
  async create(
    workspaceId: string,
    userId: string,
    dto: CreateTagDto,
  ): Promise<TagDto> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const normalizedName = this.normalizeTagName(dto.name);
    this.validateTagName(normalizedName);

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      // Check workspace tag limit
      const tagCount = await tx.tag.count({ where: { workspaceId } });
      if (tagCount >= MAX_TAGS_PER_WORKSPACE) {
        throw new BadRequestException(
          `Workspace tag limit reached (${MAX_TAGS_PER_WORKSPACE})`,
        );
      }

      // Check if tag already exists
      const existing = await tx.tag.findFirst({
        where: { workspaceId, name: normalizedName },
      });
      if (existing) {
        throw new BadRequestException(`Tag "${normalizedName}" already exists`);
      }

      const tag = await tx.tag.create({
        data: {
          name: normalizedName,
          workspaceId,
        },
      });

      return {
        id: tag.id,
        name: tag.name,
        workspaceId: tag.workspaceId,
        createdAt: tag.createdAt.toISOString(),
      };
    });
  }

  /**
   * Rename an existing tag.
   */
  async rename(
    workspaceId: string,
    userId: string,
    tagId: string,
    dto: UpdateTagDto,
  ): Promise<TagDto> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const normalizedName = this.normalizeTagName(dto.name);
    this.validateTagName(normalizedName);

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      const tag = await tx.tag.findFirst({
        where: { id: tagId, workspaceId },
      });

      if (!tag) {
        throw new NotFoundException('Tag not found');
      }

      // Check if new name conflicts with existing tag
      const existing = await tx.tag.findFirst({
        where: {
          workspaceId,
          name: normalizedName,
          NOT: { id: tagId },
        },
      });
      if (existing) {
        throw new BadRequestException(`Tag "${normalizedName}" already exists`);
      }

      const updated = await tx.tag.update({
        where: { id: tagId },
        data: { name: normalizedName },
      });

      return {
        id: updated.id,
        name: updated.name,
        workspaceId: updated.workspaceId,
        createdAt: updated.createdAt.toISOString(),
      };
    });
  }

  /**
   * Delete a tag (removes from all documents).
   */
  async delete(
    workspaceId: string,
    userId: string,
    tagId: string,
  ): Promise<void> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    await this.prisma.forWorkspace(workspaceId, async (tx) => {
      const tag = await tx.tag.findFirst({
        where: { id: tagId, workspaceId },
      });

      if (!tag) {
        throw new NotFoundException('Tag not found');
      }

      // Cascade delete will remove DocumentTag entries
      await tx.tag.delete({ where: { id: tagId } });
    });
  }

  /**
   * Get tag usage statistics.
   */
  async getStats(
    workspaceId: string,
    userId: string,
  ): Promise<{
    totalTags: number;
    orphanTags: number;
    mostUsed: TagSuggestionDto[];
  }> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    return this.prisma.forWorkspace(workspaceId, async (tx) => {
      const [totalTags, orphanTags, mostUsed] = await Promise.all([
        tx.tag.count({ where: { workspaceId } }),
        tx.tag.count({
          where: {
            workspaceId,
            documents: { none: {} },
          },
        }),
        tx.tag.findMany({
          where: { workspaceId },
          include: { _count: { select: { documents: true } } },
          orderBy: { documents: { _count: 'desc' } },
          take: 5,
        }),
      ]);

      return {
        totalTags,
        orphanTags,
        mostUsed: mostUsed.map((tag) => ({
          id: tag.id,
          name: tag.name,
          documentCount: tag._count.documents,
        })),
      };
    });
  }

  // ============ Private Helpers ============

  private normalizeTagName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private validateTagName(name: string): void {
    if (name.length < MIN_TAG_LENGTH) {
      throw new BadRequestException(
        `Tag name must be at least ${MIN_TAG_LENGTH} characters`,
      );
    }
    if (name.length > MAX_TAG_LENGTH) {
      throw new BadRequestException(
        `Tag name cannot exceed ${MAX_TAG_LENGTH} characters`,
      );
    }
    // Must start and end with alphanumeric (or be single char if MIN_TAG_LENGTH allows)
    if (name.length > 1 && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) {
      throw new BadRequestException(
        'Tag name must start and end with a letter or number',
      );
    }
    if (name.length === 1 && !/^[a-z0-9]$/.test(name)) {
      throw new BadRequestException(
        'Tag name can only contain lowercase letters and numbers',
      );
    }
  }
}
