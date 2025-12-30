import { useState, useCallback, useEffect } from 'react';
import { HTTPError } from 'ky';
import { createApiClient } from '@/shared/api/client';
import { handleApiError } from '@/shared/api';
import { InstructionSetDetail } from '../../types';
import { toast } from '@/shared/ui';

export interface ConflictDetails {
  lastModifiedAt: string;
}

interface UseSetFormParams {
  workspaceId: string | undefined;
  setId: string | undefined;
  apiClient: ReturnType<typeof createApiClient>;
  instructionSet: InstructionSetDetail | null;
  lastKnownUpdatedAt: string | null;
  setInstructionSet: React.Dispatch<React.SetStateAction<InstructionSetDetail | null>>;
  setLastKnownUpdatedAt: React.Dispatch<React.SetStateAction<string | null>>;
}

interface UseSetFormResult {
  // Form state
  name: string;
  description: string;
  isPublic: boolean;

  // Operation state
  isSaving: boolean;
  saveError: string | null;
  hasUnsavedChanges: boolean;
  conflictDetails: ConflictDetails | null;

  // Handlers
  handleNameChange: (value: string) => void;
  handleDescriptionChange: (value: string) => void;
  handlePublicChange: (value: boolean) => void;
  handleSave: () => Promise<void>;
  setSaveError: (error: string | null) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  clearConflict: () => void;
}

export function useSetForm({
  workspaceId,
  setId,
  apiClient,
  instructionSet,
  lastKnownUpdatedAt,
  setInstructionSet,
  setLastKnownUpdatedAt,
}: UseSetFormParams): UseSetFormResult {
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // Operation state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [conflictDetails, setConflictDetails] = useState<ConflictDetails | null>(null);

  // Initialize form state when instruction set is loaded
  useEffect(() => {
    if (instructionSet) {
      setName(instructionSet.name);
      setDescription(instructionSet.description || '');
      setIsPublic(instructionSet.isPublic);
    }
  }, [instructionSet]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);
      setConflictDetails(null);

      const response = await apiClient
        .patch(`workspaces/${workspaceId}/instruction-sets/${setId}`, {
          json: {
            name: name.trim(),
            description: description.trim() || null,
            isPublic,
            expectedUpdatedAt: lastKnownUpdatedAt,
          },
        })
        .json<InstructionSetDetail>();

      setInstructionSet(response);
      setLastKnownUpdatedAt(response.updatedAt);
      setHasUnsavedChanges(false);
      toast.success('Changes saved successfully');
    } catch (error: unknown) {
      console.error('Failed to save:', error);

      // Check for conflict error (HTTP 409) - special handling to update conflict state
      if (error instanceof HTTPError && error.response.status === 409) {
        try {
          const errorBody = await error.response.json() as {
            error?: {
              code?: string;
              details?: { lastModifiedAt?: string };
            };
          };
          const lastModifiedAt = errorBody?.error?.details?.lastModifiedAt;
          if (lastModifiedAt) {
            setConflictDetails({ lastModifiedAt });
            return;
          }
        } catch {
          // Fall through to generic error handling
        }
        toast.error('This set was modified by another user. Please refresh to see changes.');
      } else {
        await handleApiError(error, 'Failed to save changes');
      }
    } finally {
      setIsSaving(false);
    }
  }, [apiClient, workspaceId, setId, name, description, isPublic, lastKnownUpdatedAt, setInstructionSet, setLastKnownUpdatedAt]);

  // Mark changes when form fields change
  const handleNameChange = useCallback((value: string) => {
    setName(value);
    setHasUnsavedChanges(true);
  }, []);

  const handleDescriptionChange = useCallback((value: string) => {
    setDescription(value);
    setHasUnsavedChanges(true);
  }, []);

  const handlePublicChange = useCallback((value: boolean) => {
    setIsPublic(value);
    setHasUnsavedChanges(true);
  }, []);

  const clearConflict = useCallback(() => {
    setConflictDetails(null);
  }, []);

  return {
    name,
    description,
    isPublic,
    isSaving,
    saveError,
    hasUnsavedChanges,
    conflictDetails,
    handleNameChange,
    handleDescriptionChange,
    handlePublicChange,
    handleSave,
    setSaveError,
    setHasUnsavedChanges,
    clearConflict,
  };
}
