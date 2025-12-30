import { useCallback } from 'react';
import { LockStatus } from './useEditLock';
import { DocumentPurpose } from '@/shared/types/document.types';

interface DocumentFormData {
  title: string;
  content: string;
  sourceDescription: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
  purpose: DocumentPurpose;
  tags: string[];
}

interface AutoSaveData {
  title?: string;
  content?: string;
  sourceDescription?: string;
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED';
  purpose?: DocumentPurpose;
  tags?: string[];
}

interface UseDocumentFieldChangeOptions {
  lockStatus: LockStatus;
  scheduleAutoSave: (data: AutoSaveData, lastKnownUpdatedAt?: string) => void;
  formData: DocumentFormData;
  lastKnownUpdatedAt: string | null;
  setHasUnsavedChanges: (value: boolean) => void;
}

/**
 * Hook that provides a unified way to handle field changes with auto-save support.
 *
 * This hook eliminates code duplication by providing a single function that:
 * - Marks the form as having unsaved changes
 * - Schedules an auto-save when the user has the edit lock
 * - Works with any field in the document form
 */
export function useDocumentFieldChange({
  lockStatus,
  scheduleAutoSave,
  formData,
  lastKnownUpdatedAt,
  setHasUnsavedChanges,
}: UseDocumentFieldChangeOptions) {
  /**
   * Creates a change handler for a specific field.
   *
   * Usage:
   * ```tsx
   * const handleFieldChange = useDocumentFieldChange({ ... });
   *
   * // In JSX:
   * onChange={(e) => handleFieldChange('title', e.target.value, setTitle)}
   * onChange={(newTags) => handleFieldChange('tags', newTags, setTags)}
   * ```
   */
  const handleFieldChange = useCallback(
    <T>(
      field: keyof DocumentFormData,
      value: T,
      setter: (value: T) => void
    ) => {
      setter(value);
      setHasUnsavedChanges(true);

      if (lockStatus === 'locked_by_me') {
        scheduleAutoSave(
          {
            ...formData,
            [field]: value,
          },
          lastKnownUpdatedAt || undefined
        );
      }
    },
    [lockStatus, scheduleAutoSave, formData, lastKnownUpdatedAt, setHasUnsavedChanges]
  );

  return handleFieldChange;
}
