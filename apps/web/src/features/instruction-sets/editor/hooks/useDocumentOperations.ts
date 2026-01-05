import { useCallback } from 'react';
import { HTTPError } from 'ky';
import { createApiClient } from '@/shared/api/client';
import { getUserFriendlyMessage } from '@/shared/api/errorMessages';
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
  lastKnownUpdatedAt: string | null;
  setSelectedDocuments: React.Dispatch<React.SetStateAction<InstructionSetDocument[]>>;
  setLastKnownUpdatedAt: React.Dispatch<React.SetStateAction<string | null>>;
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
  lastKnownUpdatedAt,
  setSelectedDocuments,
  setLastKnownUpdatedAt,
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
            json: {
              documentId,
              expectedUpdatedAt: lastKnownUpdatedAt,
            },
          })
          .json<{ id: string; documentId: string; order: number; sizeBytes: number; updatedAt: string }>();

        // Add to selected documents
        const newDoc: InstructionSetDocument = {
          id: response.id,
          documentId: response.documentId,
          title: doc.title,
          sizeBytes: response.sizeBytes || doc.sizeBytes,
          order: response.order,
        };

        setSelectedDocuments((prev) => [...prev, newDoc]);
        setLastKnownUpdatedAt(response.updatedAt);
      } catch (error: unknown) {
        if (error instanceof HTTPError) {
          try {
            const errorBody = await error.response.json() as {
              error?: { code?: string };
              code?: string;
            };
            const errorCode = errorBody?.error?.code || errorBody?.code;
            const userMessage = getUserFriendlyMessage(errorCode);
            toast.error(userMessage);
            console.error('API Error:', { code: errorCode, setId }); // Log without PII
          } catch {
            toast.error(getUserFriendlyMessage());
            console.error('API Error:', { setId }); // Log without PII
          }
        } else {
          toast.error(getUserFriendlyMessage());
          console.error('Unknown error:', { setId }); // Log without PII
        }
      }
    },
    [apiClient, workspaceId, setId, availableDocuments, selectedDocuments.length, totalSizeBytes, lastKnownUpdatedAt, setSelectedDocuments, setLastKnownUpdatedAt]
  );

  // Handle removing document
  const handleRemoveDocument = useCallback(
    async (documentId: string) => {
      try {
        // Build URL with optional expectedUpdatedAt query parameter
        const url = lastKnownUpdatedAt
          ? `workspaces/${workspaceId}/instruction-sets/${setId}/documents/${documentId}?expectedUpdatedAt=${encodeURIComponent(lastKnownUpdatedAt)}`
          : `workspaces/${workspaceId}/instruction-sets/${setId}/documents/${documentId}`;

        await apiClient.delete(url);

        setSelectedDocuments((prev) => prev.filter((d) => d.documentId !== documentId));
      } catch (error: unknown) {
        if (error instanceof HTTPError) {
          try {
            const errorBody = await error.response.json() as {
              error?: { code?: string };
              code?: string;
            };
            const errorCode = errorBody?.error?.code || errorBody?.code;
            const userMessage = getUserFriendlyMessage(errorCode);
            toast.error(userMessage);
            console.error('API Error:', { code: errorCode, setId }); // Log without PII
          } catch {
            toast.error(getUserFriendlyMessage());
            console.error('API Error:', { setId }); // Log without PII
          }
        } else {
          toast.error(getUserFriendlyMessage());
          console.error('Unknown error:', { setId }); // Log without PII
        }
      }
    },
    [apiClient, workspaceId, setId, lastKnownUpdatedAt, setSelectedDocuments]
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

      try {
        const response = await apiClient.patch(`workspaces/${workspaceId}/instruction-sets/${setId}/documents/reorder`, {
          json: {
            documentIds,
            expectedUpdatedAt: lastKnownUpdatedAt,
          },
        }).json<{ documents: { documentId: string; order: number }[]; updatedAt: string }>();

        setLastKnownUpdatedAt(response.updatedAt);
      } catch (error: unknown) {
        // Revert on error
        if (instructionSet) {
          setSelectedDocuments(instructionSet.documents);
        }

        if (error instanceof HTTPError) {
          try {
            const errorBody = await error.response.json() as {
              error?: { code?: string };
              code?: string;
            };
            const errorCode = errorBody?.error?.code || errorBody?.code;
            const userMessage = getUserFriendlyMessage(errorCode);
            toast.error(userMessage);
            console.error('API Error:', { code: errorCode, setId }); // Log without PII
          } catch {
            toast.error(getUserFriendlyMessage());
            console.error('API Error:', { setId }); // Log without PII
          }
        } else {
          toast.error(getUserFriendlyMessage());
          console.error('Unknown error:', { setId }); // Log without PII
        }
      }
    },
    [apiClient, workspaceId, setId, selectedDocuments, instructionSet, lastKnownUpdatedAt, setSelectedDocuments, setLastKnownUpdatedAt]
  );

  return {
    handleAddDocument,
    handleRemoveDocument,
    handleReorder,
  };
}
