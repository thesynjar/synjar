import { useCallback, useEffect, useState } from 'react';
import type { KyInstance } from 'ky';
import { toast } from '@/shared/ui';
import type { DocumentListItem, DocumentListResponse, ProcessingStatus, VerificationStatus } from '../types';

interface UseDocumentListParams {
  apiClient: KyInstance;
  workspaceId: string;
  verificationStatus: VerificationStatus | null;
  processingStatus: ProcessingStatus | null;
  page: number;
  includePage: boolean;
  limit: number;
}

export function useDocumentList({
  apiClient,
  workspaceId,
  verificationStatus,
  processingStatus,
  page,
  includePage,
  limit,
}: UseDocumentListParams) {
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [pagination, setPagination] = useState({ page, limit, total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);

    try {
      const params = new URLSearchParams();

      if (verificationStatus) {
        params.set('verificationStatus', verificationStatus);
      }
      if (processingStatus) {
        params.set('processingStatus', processingStatus);
      }
      if (includePage) {
        params.set('page', String(page));
      }

      params.set('limit', String(limit));

      const query = params.toString();
      const endpoint = query
        ? `workspaces/${workspaceId}/documents?${query}`
        : `workspaces/${workspaceId}/documents`;

      const data = await apiClient.get(endpoint).json<DocumentListResponse>();
      setDocuments(data.documents);
      setPagination(data.pagination);
    } catch {
      setLoadError(true);
      toast.error('Failed to load documents. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, includePage, limit, page, processingStatus, verificationStatus, workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchDocuments();
    }
  }, [fetchDocuments, workspaceId]);

  return {
    documents,
    pagination,
    isLoading,
    loadError,
    refresh: fetchDocuments,
  };
}
