import { useCallback } from 'react';
import { createApiClient } from '@/shared/api/client';
import { handleApiError } from '@/shared/api';
import { InstructionSetDetail, InstructionSetDocument } from '../../types';
import { AvailableDocument, MAX_SIZE_BYTES, MAX_DOCUMENTS } from './useInstructionSetEditor';
import { toast } from '@/shared/ui';

interface UseDocumentOperationsParams {
  workspaceId: string | undefined;
  setId: string | undefined;
  apiClient: ReturnType<typeof createApiClient>;
  availableDocuments: AvailableDocument[];
  selectedDocuments: InstructionSetDocument[];
  totalSizeBytes: number;
  instructionSet: InstructionSetDetail | null;
  setSelectedDocuments: React.Dispatch<React.SetStateAction<InstructionSetDocument[]>>;
  setHasUnsavedChanges: (value: boolean) => void;
}

interface UseDocumentOperationsResult {
  handleAddDocument: (documentId: string) => Promise<void>;
  handleRemoveDocument: (documentId: string) => Promise<void>;
  handleReorder: (documentIds: string[]) => Promise<void>;
}

export function useDocumentOperations({
  workspaceId,
  setId,
  apiClient,
  availableDocuments,
  selectedDocuments,
  totalSizeBytes,
  instructionSet,
  setSelectedDocuments,
  setHasUnsavedChanges,
}: UseDocumentOperationsParams): UseDocumentOperationsResult {
  // Handle adding document
  const handleAddDocument = useCallback(
    async (documentId: string) => {
      const doc = availableDocuments.find((d) => d.id === documentId);
      if (!doc) return;

      // OPTIMIZATION: Client-side validation for immediate UX feedback
      // Source of truth: InstructionSetEntity.addDocument() enforces these invariants
      // Backend will reject if limits exceeded (defense in depth)
      if (selectedDocuments.length >= MAX_DOCUMENTS) {
        toast.error(`Maximum ${MAX_DOCUMENTS} documents allowed`);
        return;
      }

      if (totalSizeBytes + doc.sizeBytes > MAX_SIZE_BYTES) {
        toast.error('Adding this document would exceed the 100 KB limit');
        return;
      }

      try {
        const response = await apiClient
          .post(`workspaces/${workspaceId}/instruction-sets/${setId}/documents`, {
            json: { documentId },
          })
          .json<{ id: string; documentId: string; order: number; sizeBytes: number }>();

        // Add to selected documents
        const newDoc: InstructionSetDocument = {
          id: response.id,
          documentId: response.documentId,
          title: doc.title,
          sizeBytes: response.sizeBytes || doc.sizeBytes,
          order: response.order,
        };

        setSelectedDocuments((prev) => [...prev, newDoc]);
        setHasUnsavedChanges(true);
      } catch (error: unknown) {
        console.error('Failed to add document:', error);
        await handleApiError(error, 'Failed to add document');
      }
    },
    [apiClient, workspaceId, setId, availableDocuments, selectedDocuments.length, totalSizeBytes, setSelectedDocuments, setHasUnsavedChanges]
  );

  // Handle removing document
  const handleRemoveDocument = useCallback(
    async (documentId: string) => {
      try {
        await apiClient.delete(`workspaces/${workspaceId}/instruction-sets/${setId}/documents/${documentId}`);

        setSelectedDocuments((prev) => prev.filter((d) => d.documentId !== documentId));
        setHasUnsavedChanges(true);
      } catch (error) {
        console.error('Failed to remove document:', error);
        toast.error('Failed to remove document');
      }
    },
    [apiClient, workspaceId, setId, setSelectedDocuments, setHasUnsavedChanges]
  );

  // Handle reordering documents
  const handleReorder = useCallback(
    async (documentIds: string[]) => {
      // Optimistic update
      const newOrder = documentIds
        .map((id, index) => {
          const doc = selectedDocuments.find((d) => d.documentId === id);
          return doc ? { ...doc, order: index } : null;
        })
        .filter(Boolean) as InstructionSetDocument[];

      setSelectedDocuments(newOrder);
      setHasUnsavedChanges(true);

      try {
        await apiClient.patch(`workspaces/${workspaceId}/instruction-sets/${setId}/documents/reorder`, {
          json: { documentIds },
        });
      } catch (error) {
        console.error('Failed to reorder documents:', error);
        toast.error('Failed to reorder documents');
        // Revert on error
        if (instructionSet) {
          setSelectedDocuments(instructionSet.documents);
        }
      }
    },
    [apiClient, workspaceId, setId, selectedDocuments, instructionSet, setSelectedDocuments, setHasUnsavedChanges]
  );

  return {
    handleAddDocument,
    handleRemoveDocument,
    handleReorder,
  };
}
