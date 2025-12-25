import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IDocumentRepository,
  CreateDocumentData,
  UpdateDocumentData,
  DocumentWithRelations,
  DocumentFilters,
} from '../../../domain/document/document.repository';

@Injectable()
export class PrismaDocumentRepository implements IDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<DocumentWithRelations | null> {
    return this.prisma.document.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        chunks: true,
      },
    });
  }

  async findByWorkspace(
    workspaceId: string,
    filters?: DocumentFilters,
  ): Promise<{ documents: DocumentWithRelations[]; total: number }> {
    const where: Prisma.DocumentWhereInput = { workspaceId };

    if (filters?.verificationStatus) {
      where.verificationStatus = filters.verificationStatus;
    }

    if (filters?.processingStatus) {
      where.processingStatus = filters.processingStatus;
    }

    if (filters?.tags?.length) {
      where.tags = {
        some: {
          tag: {
            name: { in: filters.tags },
          },
        },
      };
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: {
          tags: { include: { tag: true } },
          chunks: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.document.count({ where }),
    ]);

    return { documents, total };
  }

  async create(data: CreateDocumentData): Promise<DocumentWithRelations> {
    // Create or find tags
    const tagRecords = data.tags?.length
      ? await Promise.all(
          data.tags.map((tagName) =>
            this.prisma.tag.upsert({
              where: { name: tagName.toLowerCase() },
              update: {},
              create: { name: tagName.toLowerCase() },
            }),
          ),
        )
      : [];

    return this.prisma.document.create({
      data: {
        workspaceId: data.workspaceId,
        title: data.title,
        content: data.content,
        contentType: data.contentType,
        originalFilename: data.originalFilename,
        fileUrl: data.fileUrl,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        sourceDescription: data.sourceDescription,
        verificationStatus: data.verificationStatus || 'UNVERIFIED',
        processingStatus: 'PENDING',
        tags: {
          create: tagRecords.map((tag) => ({
            tagId: tag.id,
          })),
        },
      },
      include: {
        tags: { include: { tag: true } },
        chunks: true,
      },
    });
  }

  async update(
    id: string,
    data: UpdateDocumentData,
  ): Promise<DocumentWithRelations> {
    // Handle tags update
    let tagsUpdate = {};
    if (data.tags !== undefined) {
      const tagRecords = await Promise.all(
        data.tags.map((tagName) =>
          this.prisma.tag.upsert({
            where: { name: tagName.toLowerCase() },
            update: {},
            create: { name: tagName.toLowerCase() },
          }),
        ),
      );

      tagsUpdate = {
        tags: {
          deleteMany: {},
          create: tagRecords.map((tag) => ({
            tagId: tag.id,
          })),
        },
      };
    }

    return this.prisma.document.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        sourceDescription: data.sourceDescription,
        verificationStatus: data.verificationStatus,
        processingStatus: data.processingStatus,
        processingError: data.processingError,
        ...tagsUpdate,
      },
      include: {
        tags: { include: { tag: true } },
        chunks: true,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.document.delete({ where: { id } });
  }
}
