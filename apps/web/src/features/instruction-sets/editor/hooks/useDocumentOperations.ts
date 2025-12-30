import { useCallback } from 'react';
import { createApiClient } from '@/shared/api/client';
import { InstructionSetDetail, InstructionSetDocument } from '../../types';
import { AvailableDocument, MAX_SIZE_BYTES, MAX_DOCUMENTS } from './useInstructionSetEditor';

interface UseDocumentOperationsParams {
  setId: string | undefined;
  apiClient: ReturnType<typeof createApiClient>;
  availableDocuments: AvailableDocument[];
  selectedDocuments: InstructionSetDocument[];
  totalSizeBytes: number;
  instructionSet: InstructionSetDetail | null;
  setSelectedDocuments: React.Dispatch<React.SetStateAction<InstructionSetDocument[]>>;
  setSaveError: (error: string | null) => void;
  setHasUnsavedChanges: (value: boolean) => void;
}

interface UseDocumentOperationsResult {
  handleAddDocument: (documentId: string) => Promise<void>;
  handleRemoveDocument: (documentId: string) => Promise<void>;
  handleReorder: (documentIds: string[]) => Promise<void>;
}

export function useDocumentOperations({
  setId,
  apiClient,
  availableDocuments,
  selectedDocuments,
  totalSizeBytes,
  instructionSet,
  setSelectedDocuments,
  setSaveError,
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
        setSaveError(`Maximum ${MAX_DOCUMENTS} documents allowed`);
        return;
      }

      if (totalSizeBytes + doc.sizeBytes > MAX_SIZE_BYTES) {
        setSaveError('Adding this document would exceed the 100 KB limit');
        return;
      }

      try {
        setSaveError(null);
        const response = await apiClient
          .post(`instruction-sets/${setId}/documents`, {
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
        const errorMessage = error instanceof Error ? error.message : 'Failed to add document';
        setSaveError(errorMessage);
      }
    },
    [apiClient, setId, availableDocuments, selectedDocuments.length, totalSizeBytes, setSaveError, setSelectedDocuments, setHasUnsavedChanges]
  );

  // Handle removing document
  const handleRemoveDocument = useCallback(
    async (documentId: string) => {
      try {
        setSaveError(null);
        await apiClient.delete(`instruction-sets/${setId}/documents/${documentId}`);

        setSelectedDocuments((prev) => prev.filter((d) => d.documentId !== documentId));
        setHasUnsavedChanges(true);
      } catch (error) {
        console.error('Failed to remove document:', error);
        setSaveError('Failed to remove document');
      }
    },
    [apiClient, setId, setSaveError, setSelectedDocuments, setHasUnsavedChanges]
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
        setSaveError(null);
        await apiClient.patch(`instruction-sets/${setId}/documents/reorder`, {
          json: { documentIds },
        });
      } catch (error) {
        console.error('Failed to reorder documents:', error);
        setSaveError('Failed to reorder documents');
        // Revert on error
        if (instructionSet) {
          setSelectedDocuments(instructionSet.documents);
        }
      }
    },
    [apiClient, setId, selectedDocuments, instructionSet, setSaveError, setSelectedDocuments, setHasUnsavedChanges]
  );

  return {
    handleAddDocument,
    handleRemoveDocument,
    handleReorder,
  };
}
