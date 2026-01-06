import { useState, useEffect, useMemo } from 'react';
import { INSTRUCTION_SET_LIMITS } from '@synjar/shared';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { InstructionSetDetail, InstructionSetDocument } from '../../types';

// Re-export limits from shared package for backward compatibility
export const { MAX_SIZE_BYTES, MAX_DOCUMENTS } = INSTRUCTION_SET_LIMITS;

// Re-export AvailableDocument from new hook for backward compatibility
export type { AvailableDocument } from './useAvailableDocuments';

interface UseInstructionSetEditorParams {
  workspaceId: string | undefined;
  setId: string | undefined;
}

interface UseInstructionSetEditorResult {
  // Loading states
  isLoading: boolean;
  loadError: string | null;

  // Data
  instructionSet: InstructionSetDetail | null;
  selectedDocuments: InstructionSetDocument[];
  lastKnownUpdatedAt: string | null;

  // Computed values
  totalSizeBytes: number;
  selectedDocumentIds: string[];

  // Setters for external mutation
  setSelectedDocuments: React.Dispatch<React.SetStateAction<InstructionSetDocument[]>>;
  setInstructionSet: React.Dispatch<React.SetStateAction<InstructionSetDetail | null>>;
  setLastKnownUpdatedAt: React.Dispatch<React.SetStateAction<string | null>>;

  // API client for operations
  apiClient: ReturnType<typeof createApiClient>;
}

export function useInstructionSetEditor({
  workspaceId,
  setId,
}: UseInstructionSetEditorParams): UseInstructionSetEditorResult {
  const authStore = useAuthStore();

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Data state
  const [instructionSet, setInstructionSet] = useState<InstructionSetDetail | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<InstructionSetDocument[]>([]);
  const [lastKnownUpdatedAt, setLastKnownUpdatedAt] = useState<string | null>(null);

  const apiClient = useMemo(
    () =>
      createApiClient({
        getAccessToken: authStore.getAccessToken,
        getRefreshToken: authStore.getRefreshToken,
        setTokens: authStore.setTokens,
        clearTokens: authStore.clearTokens,
        getWorkspaceId: () => workspaceId || null,
      }),
    [authStore, workspaceId]
  );

  // Calculate total size
  const totalSizeBytes = useMemo(
    () => selectedDocuments.reduce((sum, doc) => sum + doc.sizeBytes, 0),
    [selectedDocuments]
  );

  // Selected document IDs for filtering available list
  const selectedDocumentIds = useMemo(
    () => selectedDocuments.map((d) => d.documentId),
    [selectedDocuments]
  );

  // Fetch instruction set data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const setData = await apiClient
          .get(`workspaces/${workspaceId}/instruction-sets/${setId}`)
          .json<InstructionSetDetail>();

        // Set form state from fetched data
        setInstructionSet(setData);
        setSelectedDocuments(setData.documents);
        setLastKnownUpdatedAt(setData.updatedAt);
      } catch (error) {
        console.error('Failed to fetch instruction set:', error);
        setLoadError('Failed to load instruction set');
      } finally {
        setIsLoading(false);
      }
    };

    if (workspaceId && setId) {
      fetchData();
    }
  }, [apiClient, workspaceId, setId]);

  return {
    isLoading,
    loadError,
    instructionSet,
    selectedDocuments,
    lastKnownUpdatedAt,
    totalSizeBytes,
    selectedDocumentIds,
    setSelectedDocuments,
    setInstructionSet,
    setLastKnownUpdatedAt,
    apiClient,
  };
}
