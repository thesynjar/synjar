import { VerificationStatus } from '@prisma/client';

export interface SearchResult {
  documentId: string;
  chunkId: string;
  content: string;
  score: number;
  title: string;
  fileUrl: string | null;
  verificationStatus: VerificationStatus;
}

export interface SearchFilters {
  workspaceId: string;
  embedding: string;
  tags?: string[];
  includeUnverified?: boolean;
  limit?: number;
}

export interface ISearchRepository {
  searchByEmbedding(filters: SearchFilters): Promise<SearchResult[]>;
  getDocumentTags(documentIds: string[]): Promise<Map<string, string[]>>;
  getTotalCount(workspaceId: string, includeUnverified: boolean): Promise<number>;
}

export const SEARCH_REPOSITORY = Symbol('ISearchRepository');
