import { DocumentPurpose } from '@/shared/types/document.types';

export type ContentType = 'TEXT' | 'FILE';
export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED';
export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = ['VERIFIED', 'UNVERIFIED'];
export const PROCESSING_STATUSES: readonly ProcessingStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];

export interface DocumentListItem {
  id: string;
  title: string;
  content: string;
  contentType: ContentType;
  originalFilename: string | null;
  fileSize: number | null;
  verificationStatus: VerificationStatus;
  processingStatus: ProcessingStatus;
  purpose: DocumentPurpose;
  createdAt: string;
  tags: Array<{ tag: { id: string; name: string } }>;
  hasDraft: boolean;
}

export interface DocumentListResponse {
  documents: DocumentListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
