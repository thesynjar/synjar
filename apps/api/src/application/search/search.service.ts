import { Injectable, Inject } from '@nestjs/common';
import { WorkspaceService } from '../workspace/workspace.service';
import {
  IEmbeddingsService,
  EMBEDDINGS_SERVICE,
} from '@/domain/document/embeddings.port';
import {
  ISearchRepository,
  SEARCH_REPOSITORY,
} from '@/domain/search/search.repository';
import { VerificationStatus } from '@prisma/client';

export interface SearchDto {
  query: string;
  tags?: string[];
  limit?: number;
  includeUnverified?: boolean;
}

export interface SearchResult {
  documentId: string;
  chunkId: string;
  title: string;
  content: string;
  score: number;
  tags: string[];
  verificationStatus: VerificationStatus;
  fileUrl: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly workspaceService: WorkspaceService,
    @Inject(EMBEDDINGS_SERVICE)
    private readonly embeddingsService: IEmbeddingsService,
    @Inject(SEARCH_REPOSITORY)
    private readonly searchRepository: ISearchRepository,
  ) {}

  async search(
    workspaceId: string,
    userId: string,
    dto: SearchDto,
  ): Promise<SearchResponse> {
    await this.workspaceService.ensureMember(workspaceId, userId);

    const limit = dto.limit || 10;
    const includeUnverified = dto.includeUnverified || false;

    // Generate embedding for query
    const { embedding } = await this.embeddingsService.generateEmbedding(dto.query);

    // Serialize embedding for vector operations
    const embeddingVector = JSON.stringify(embedding);

    // Search using repository
    const results = await this.searchRepository.searchByEmbedding({
      workspaceId,
      embedding: embeddingVector,
      tags: dto.tags,
      includeUnverified,
      limit,
    });

    // Get tags for documents
    const documentIds = [...new Set(results.map((r) => r.documentId))];
    const tagsByDocument = await this.searchRepository.getDocumentTags(documentIds);

    // Get total count of searchable documents
    const totalCount = await this.searchRepository.getTotalCount(
      workspaceId,
      includeUnverified,
    );

    return {
      results: results.map((r) => ({
        documentId: r.documentId,
        chunkId: r.chunkId,
        title: r.title,
        content: r.content,
        score: r.score,
        tags: tagsByDocument.get(r.documentId) || [],
        verificationStatus: r.verificationStatus,
        fileUrl: r.fileUrl,
      })),
      totalCount,
    };
  }
}
