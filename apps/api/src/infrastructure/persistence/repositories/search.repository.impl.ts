import { Injectable } from '@nestjs/common';
import { Prisma, VerificationStatus, ProcessingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ISearchRepository,
  SearchFilters,
  SearchResult,
} from '../../../domain/search/search.repository';

@Injectable()
export class PrismaSearchRepository implements ISearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchByEmbedding(filters: SearchFilters): Promise<SearchResult[]> {
    const {
      workspaceId,
      embedding,
      tags,
      includeUnverified,
      limit = 10,
    } = filters;

    const tagFilter =
      tags && tags.length > 0
        ? Prisma.sql`AND d.id IN (
          SELECT dt."documentId" FROM "DocumentTag" dt
          JOIN "Tag" t ON t.id = dt."tagId"
          WHERE t.name IN (${Prisma.join(tags)})
        )`
        : Prisma.empty;

    const verificationFilter = includeUnverified
      ? Prisma.empty
      : Prisma.sql`AND d."verificationStatus" = 'VERIFIED'`;

    const results = await this.prisma.$queryRaw<
      Array<{
        chunk_id: string;
        document_id: string;
        chunk_content: string;
        score: number;
        title: string;
        file_url: string | null;
        verification_status: VerificationStatus;
      }>
    >`
      SELECT
        c.id as chunk_id,
        d.id as document_id,
        c.content as chunk_content,
        1 - (c.embedding <=> ${embedding}::vector) as score,
        d.title,
        d."fileUrl" as file_url,
        d."verificationStatus" as verification_status
      FROM "Chunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE d."workspaceId"::text = ${workspaceId}
        AND d."processingStatus" = 'COMPLETED'
        ${tagFilter}
        ${verificationFilter}
      ORDER BY c.embedding <=> ${embedding}::vector
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      documentId: r.document_id,
      chunkId: r.chunk_id,
      content: r.chunk_content,
      score: r.score,
      title: r.title,
      fileUrl: r.file_url,
      verificationStatus: r.verification_status,
    }));
  }

  async getDocumentTags(documentIds: string[]): Promise<Map<string, string[]>> {
    const documentTags = await this.prisma.documentTag.findMany({
      where: { documentId: { in: documentIds } },
      include: { tag: true },
    });

    const tagsByDocument = new Map<string, string[]>();
    for (const dt of documentTags) {
      const tags = tagsByDocument.get(dt.documentId) || [];
      tags.push(dt.tag.name);
      tagsByDocument.set(dt.documentId, tags);
    }

    return tagsByDocument;
  }

  async getTotalCount(
    workspaceId: string,
    includeUnverified: boolean,
  ): Promise<number> {
    return this.prisma.document.count({
      where: {
        workspaceId,
        processingStatus: ProcessingStatus.COMPLETED,
        ...(includeUnverified
          ? {}
          : { verificationStatus: VerificationStatus.VERIFIED }),
      },
    });
  }
}
