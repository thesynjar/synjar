import { useState, useCallback, useEffect } from 'react';
import { createApiClient } from '@/shared/api/client';
import { InstructionSetDetail } from '../../types';

interface UseSetFormParams {
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

  // Handlers
  handleNameChange: (value: string) => void;
  handleDescriptionChange: (value: string) => void;
  handlePublicChange: (value: boolean) => void;
  handleSave: () => Promise<void>;
  setSaveError: (error: string | null) => void;
  setHasUnsavedChanges: (value: boolean) => void;
}

export function useSetForm({
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
      setSaveError('Name is required');
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      const response = await apiClient
        .patch(`instruction-sets/${setId}`, {
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
    } catch (error: unknown) {
      console.error('Failed to save:', error);

      // Check for conflict error
      if (error instanceof Error && error.message.includes('409')) {
        setSaveError('This set was modified by another user. Please refresh to see changes.');
      } else {
        setSaveError('Failed to save changes');
      }
    } finally {
      setIsSaving(false);
    }
  }, [apiClient, setId, name, description, isPublic, lastKnownUpdatedAt, setInstructionSet, setLastKnownUpdatedAt]);

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

  return {
    name,
    description,
    isPublic,
    isSaving,
    saveError,
    hasUnsavedChanges,
    handleNameChange,
    handleDescriptionChange,
    handlePublicChange,
    handleSave,
    setSaveError,
    setHasUnsavedChanges,
  };
}
