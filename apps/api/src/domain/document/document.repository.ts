import { Document, Chunk, Tag } from '@prisma/client';

export interface CreateDocumentData {
  workspaceId: string;
  title: string;
  content: string;
  contentType: 'TEXT' | 'FILE';
  originalFilename?: string;
  fileUrl?: string;
  mimeType?: string;
  fileSize?: number;
  sourceDescription?: string;
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED';
  tags?: string[];
}

export interface UpdateDocumentData {
  title?: string;
  content?: string;
  sourceDescription?: string;
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED';
  processingStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  processingError?: string;
  tags?: string[];
}

export interface DocumentWithRelations extends Document {
  tags: { tag: Tag }[];
  chunks: Chunk[];
}

export interface DocumentFilters {
  tags?: string[];
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED';
  processingStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  page?: number;
  limit?: number;
}

export interface IDocumentRepository {
  findById(id: string): Promise<DocumentWithRelations | null>;
  findByWorkspace(
    workspaceId: string,
    filters?: DocumentFilters,
  ): Promise<{ documents: DocumentWithRelations[]; total: number }>;
  create(data: CreateDocumentData): Promise<DocumentWithRelations>;
  update(id: string, data: UpdateDocumentData): Promise<DocumentWithRelations>;
  delete(id: string): Promise<void>;
}

export const DOCUMENT_REPOSITORY = Symbol('IDocumentRepository');
