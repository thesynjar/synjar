import { useState, useEffect, useMemo } from 'react';
import { INSTRUCTION_SET_LIMITS } from '@synjar/shared';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { InstructionSetDetail, InstructionSetDocument } from '../../types';

// Re-export limits from shared package for backward compatibility
export const { MAX_SIZE_BYTES, MAX_DOCUMENTS } = INSTRUCTION_SET_LIMITS;

export interface AvailableDocument {
  id: string;
  title: string;
  sizeBytes: number;
  purpose: 'KNOWLEDGE' | 'INSTRUCTION';
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
  content: string;
}

interface DocumentsResponse {
  documents: Array<{
    id: string;
    title: string;
    content: string;
    purpose: 'KNOWLEDGE' | 'INSTRUCTION';
    verificationStatus: 'VERIFIED' | 'UNVERIFIED';
  }>;
}

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
  availableDocuments: AvailableDocument[];
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
  const [availableDocuments, setAvailableDocuments] = useState<AvailableDocument[]>([]);
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

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const [setData, docsData] = await Promise.all([
          apiClient.get(`workspaces/${workspaceId}/instruction-sets/${setId}`).json<InstructionSetDetail>(),
          apiClient
            .get(`workspaces/${workspaceId}/documents?verificationStatus=VERIFIED`)
            .json<DocumentsResponse>()
            .catch(() => ({ documents: [] })),
        ]);

        // Set form state from fetched data
        setInstructionSet(setData);
        setSelectedDocuments(setData.documents);
        setLastKnownUpdatedAt(setData.updatedAt);

        // Transform available documents (including content for client-side preview)
        const available: AvailableDocument[] = docsData.documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          sizeBytes: doc.content ? new TextEncoder().encode(doc.content).length : 0,
          purpose: doc.purpose || 'KNOWLEDGE',
          verificationStatus: doc.verificationStatus,
          content: doc.content || '',
        }));
        setAvailableDocuments(available);
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
    availableDocuments,
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
