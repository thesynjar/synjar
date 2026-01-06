import { useState, useEffect, useCallback, useRef } from 'react';
import type { KyInstance } from 'ky';
import { DocumentPurpose, DEFAULT_DOCUMENT_PURPOSE } from '@/shared/types/document.types';

export interface AvailableDocument {
  id: string;
  title: string;
  sizeBytes: number;
  purpose: DocumentPurpose;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
  content: string;
  tags: Array<{ tag: { id: string; name: string } }>;
}

interface DocumentsApiResponse {
  documents: Array<{
    id: string;
    title: string;
    content: string;
    purpose: DocumentPurpose;
    verificationStatus: 'VERIFIED' | 'UNVERIFIED';
    tags: Array<{ tag: { id: string; name: string } }>;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface UseAvailableDocumentsParams {
  apiClient: KyInstance;
  workspaceId: string | undefined;
  search: string;
  page: number;
}

interface UseAvailableDocumentsResult {
  documents: AvailableDocument[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const DEBOUNCE_MS = 300;
// Intentionally smaller than main DocumentListPanel (20) for better modal UX
const DEFAULT_LIMIT = 10;

export function useAvailableDocuments({
  apiClient,
  workspaceId,
  search,
  page,
}: UseAvailableDocumentsParams): UseAvailableDocumentsResult {
  const [documents, setDocuments] = useState<AvailableDocument[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the latest search to avoid race conditions
  const latestSearchRef = useRef(search);
  latestSearchRef.current = search;

  const fetchDocuments = useCallback(async (searchQuery: string, pageNum: number) => {
    if (!workspaceId) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('verificationStatus', 'VERIFIED');
      params.set('page', String(pageNum));
      params.set('limit', String(DEFAULT_LIMIT));

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const data = await apiClient
        .get(`workspaces/${workspaceId}/documents?${params.toString()}`)
        .json<DocumentsApiResponse>();

      // Only update if this is still the latest search
      if (searchQuery === latestSearchRef.current) {
        const transformed: AvailableDocument[] = data.documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          sizeBytes: doc.content ? new TextEncoder().encode(doc.content).length : 0,
          purpose: doc.purpose || DEFAULT_DOCUMENT_PURPOSE,
          verificationStatus: doc.verificationStatus,
          content: doc.content || '',
          tags: doc.tags || [],
        }));

        setDocuments(transformed);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setError('Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, workspaceId]);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDocuments(search, page);
    }, search ? DEBOUNCE_MS : 0); // No debounce on initial load

    return () => clearTimeout(timer);
  }, [search, page, fetchDocuments]);

  const refetch = useCallback(async () => {
    await fetchDocuments(search, page);
  }, [fetchDocuments, search, page]);

  return {
    documents,
    pagination,
    isLoading,
    error,
    refetch,
  };
}
