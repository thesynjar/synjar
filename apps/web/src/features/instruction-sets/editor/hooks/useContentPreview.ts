import { useState, useCallback } from 'react';
import { createApiClient } from '@/shared/api/client';

interface PreviewContent {
  id: string;
  name: string;
  description: string | null;
  content: string;
  totalSizeBytes: number;
  tokenEstimate: number;
}

interface UseContentPreviewParams {
  setId: string | undefined;
  isPublic: boolean;
  apiClient: ReturnType<typeof createApiClient>;
}

interface UseContentPreviewResult {
  previewContent: PreviewContent | null;
  isLoadingPreview: boolean;
  previewError: string | null;
  fetchPreview: () => Promise<void>;
  clearPreview: () => void;
}

export function useContentPreview({
  setId,
  isPublic,
  apiClient,
}: UseContentPreviewParams): UseContentPreviewResult {
  const [previewContent, setPreviewContent] = useState<PreviewContent | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!setId) return;

    // For private sets, we need to use authenticated endpoint
    // For public sets, we can use the public endpoint
    if (!isPublic) {
      setPreviewError('Make the instruction set public to preview content');
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError(null);

    try {
      // Use the public content endpoint
      const response = await apiClient.get(`s/${setId}/content`).json<PreviewContent>();
      setPreviewContent(response);
    } catch (error) {
      console.error('Failed to fetch preview:', error);
      setPreviewError('Failed to load preview content');
    } finally {
      setIsLoadingPreview(false);
    }
  }, [apiClient, setId, isPublic]);

  const clearPreview = useCallback(() => {
    setPreviewContent(null);
    setPreviewError(null);
  }, []);

  return {
    previewContent,
    isLoadingPreview,
    previewError,
    fetchPreview,
    clearPreview,
  };
}
