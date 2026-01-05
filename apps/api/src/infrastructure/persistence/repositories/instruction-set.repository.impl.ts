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
    // Public access - use SECURITY DEFINER functions to bypass RLS
    // Only returns instruction sets with isPublic=true and VERIFIED documents

    // First, get the instruction set metadata
    const setRows = await this.prisma.$queryRaw<Array<{
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
      is_public: boolean;
      created_at: Date;
      updated_at: Date;
    }>>`SELECT * FROM lookup_public_instruction_set(${id})`;

    if (!setRows || setRows.length === 0) return null;

    const setRow = setRows[0];

    // Then, get the documents (only VERIFIED ones)
    const docRows = await this.prisma.$queryRaw<Array<{
      id: string;
      instruction_set_id: string;
      document_id: string;
      doc_order: number;
      title: string;
      content: string;
      file_url: string | null;
    }>>`SELECT * FROM get_public_instruction_set_documents(${id})`;

    return InstructionSetEntity.reconstitute({
      id: setRow.id,
      workspaceId: setRow.workspace_id,
      name: setRow.name,
      description: setRow.description,
      isPublic: setRow.is_public,
      createdAt: setRow.created_at,
      updatedAt: setRow.updated_at,
      documents: (docRows || []).map(d => ({
        id: d.id,
        instructionSetId: d.instruction_set_id,
        documentId: d.document_id,
        order: d.doc_order,
        title: d.title,
        content: d.content,
        sizeBytes: Buffer.byteLength(d.content, 'utf8'),
        fileUrl: d.file_url,
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
