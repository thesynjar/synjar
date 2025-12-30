import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IInstructionSetRepository,
} from '../../../domain/instruction-set/instruction-set.repository';
import {
  InstructionSetEntity,
} from '../../../domain/instruction-set/instruction-set.entity';

// Prisma include for full instruction set with documents
const instructionSetInclude = {
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
} satisfies Prisma.InstructionSetInclude;

type InstructionSetWithDocuments = Prisma.InstructionSetGetPayload<{
  include: typeof instructionSetInclude;
}>;

@Injectable()
export class PrismaInstructionSetRepository implements IInstructionSetRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(data: InstructionSetWithDocuments): InstructionSetEntity {
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

  async findById(id: string): Promise<InstructionSetEntity | null> {
    const data = await this.prisma.instructionSet.findUnique({
      where: { id },
      include: instructionSetInclude,
    });

    if (!data) return null;
    return this.toEntity(data);
  }

  async findByIdPublic(id: string): Promise<InstructionSetEntity | null> {
    // Public access - bypass RLS by using raw query or direct access
    // We need to check isPublic=true AND only return VERIFIED documents
    const data = await this.prisma.$queryRaw<InstructionSetWithDocuments[]>`
      SELECT
        is_.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', isd."id",
              'instructionSetId', isd."instructionSetId",
              'documentId', isd."documentId",
              'order', isd."order",
              'document', json_build_object(
                'id', d."id",
                'title', d."title",
                'content', d."content",
                'fileUrl', d."fileUrl",
                'verificationStatus', d."verificationStatus",
                'purpose', d."purpose"
              )
            ) ORDER BY isd."order"
          ) FILTER (WHERE isd."id" IS NOT NULL AND d."verificationStatus" = 'VERIFIED'),
          '[]'
        ) as documents
      FROM "InstructionSet" is_
      LEFT JOIN "InstructionSetDocument" isd ON isd."instructionSetId" = is_."id"
      LEFT JOIN "Document" d ON d."id" = isd."documentId"
      WHERE is_."id" = ${id}::text AND is_."isPublic" = true
      GROUP BY is_."id"
    `;

    if (!data || data.length === 0) return null;

    const row = data[0];
    return InstructionSetEntity.reconstitute({
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      description: row.description,
      isPublic: row.isPublic,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      documents: (row.documents as unknown as Array<{
        id: string;
        instructionSetId: string;
        documentId: string;
        order: number;
        document: {
          id: string;
          title: string;
          content: string;
          fileUrl: string | null;
          verificationStatus: string;
          purpose: string;
        };
      }>).map(d => ({
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

  async findByWorkspace(workspaceId: string): Promise<InstructionSetEntity[]> {
    const data = await this.prisma.instructionSet.findMany({
      where: { workspaceId },
      include: instructionSetInclude,
      orderBy: { createdAt: 'desc' },
    });

    return data.map(d => this.toEntity(d));
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    return this.prisma.instructionSet.count({
      where: { workspaceId },
    });
  }

  async create(entity: InstructionSetEntity): Promise<InstructionSetEntity> {
    const data = await this.prisma.instructionSet.create({
      data: {
        workspaceId: entity.workspaceId,
        name: entity.name,
        description: entity.description,
        isPublic: entity.isPublic,
      },
      include: instructionSetInclude,
    });

    return this.toEntity(data);
  }

  async update(entity: InstructionSetEntity): Promise<InstructionSetEntity> {
    const data = await this.prisma.instructionSet.update({
      where: { id: entity.id },
      data: {
        name: entity.name,
        description: entity.description,
        isPublic: entity.isPublic,
      },
      include: instructionSetInclude,
    });

    return this.toEntity(data);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.instructionSet.delete({ where: { id } });
  }

  async addDocument(instructionSetId: string, documentId: string, order: number): Promise<void> {
    await this.prisma.instructionSetDocument.create({
      data: {
        instructionSetId,
        documentId,
        order,
      },
    });
  }

  async removeDocument(instructionSetId: string, documentId: string): Promise<void> {
    await this.prisma.instructionSetDocument.deleteMany({
      where: {
        instructionSetId,
        documentId,
      },
    });
  }

  async updateDocumentOrders(
    instructionSetId: string,
    documentOrders: { documentId: string; order: number }[],
  ): Promise<void> {
    // Use transaction to update all orders atomically
    await this.prisma.$transaction(
      documentOrders.map(({ documentId, order }) =>
        this.prisma.instructionSetDocument.updateMany({
          where: { instructionSetId, documentId },
          data: { order },
        }),
      ),
    );
  }
}
