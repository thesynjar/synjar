import { useState, useEffect, useCallback, useRef } from 'react';
import { DocumentPurpose } from '@/shared/types/document.types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

interface AutoSaveData {
  title?: string;
  content?: string;
  originalFilename?: string;
  sourceDescription?: string;
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED';
  purpose?: DocumentPurpose;
  tags?: string[];
}

interface UseAutoSaveOptions {
  workspaceId: string;
  documentId: string;
  apiClient: {
    patch: (path: string, options: { json: object }) => { json: <T>() => Promise<T> };
  };
  debounceMs?: number; // default 2000
  maxRetries?: number; // default 3
  onSaved?: (updatedAt: string) => void;
  onConflict?: (serverUpdatedAt: string) => void;
  onError?: (error: string) => void;
}

interface UseAutoSaveResult {
  saveStatus: SaveStatus;
  error: string | null;
  lastSavedAt: string | null;
  save: (data: AutoSaveData, lastKnownUpdatedAt?: string) => Promise<boolean>;
  forceSave: () => Promise<boolean>;
  scheduleAutoSave: (data: AutoSaveData, lastKnownUpdatedAt?: string) => void;
  cancelPendingSave: () => void;
}

export function useAutoSave({
  workspaceId,
  documentId,
  apiClient,
  debounceMs = 2000,
  maxRetries = 3,
  onSaved,
  onConflict,
  onError,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDataRef = useRef<{ data: AutoSaveData; lastKnownUpdatedAt?: string } | null>(null);
  const retryCountRef = useRef(0);

  const basePath = `workspaces/${workspaceId}/documents/${documentId}`;

  const cancelPendingSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingDataRef.current = null;
  }, []);

  const save = useCallback(async (
    data: AutoSaveData,
    lastKnownUpdatedAt?: string
  ): Promise<boolean> => {
    setSaveStatus('saving');
    setError(null);

    try {
      const response = await apiClient.patch(basePath, {
        json: {
          ...data,
          lastKnownUpdatedAt,
        },
      }).json<{ updatedAt: string }>();

      setSaveStatus('saved');
      setLastSavedAt(response.updatedAt);
      retryCountRef.current = 0;
      onSaved?.(response.updatedAt);

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus((current) => current === 'saved' ? 'idle' : current);
      }, 2000);

      return true;
    } catch (err: unknown) {
      const errorData = (err as { response?: { json?: () => Promise<{ error?: string; serverUpdatedAt?: string; message?: string }> } })?.response;

      if (errorData?.json) {
        try {
          const responseData = await errorData.json();
          if (responseData.error === 'CONFLICT') {
            setSaveStatus('conflict');
            setError('Document was modified by another user');
            onConflict?.(responseData.serverUpdatedAt || '');
            return false;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      // Retry logic
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        const delay = Math.pow(2, retryCountRef.current) * 1000; // Exponential backoff
        setTimeout(() => {
          save(data, lastKnownUpdatedAt);
        }, delay);
        return false;
      }

      setSaveStatus('error');
      const errorMessage = 'Failed to save document';
      setError(errorMessage);
      onError?.(errorMessage);
      return false;
    }
  }, [apiClient, basePath, maxRetries, onSaved, onConflict, onError]);

  const forceSave = useCallback(async (): Promise<boolean> => {
    if (pendingDataRef.current) {
      const { data, lastKnownUpdatedAt } = pendingDataRef.current;
      cancelPendingSave();
      return save(data, lastKnownUpdatedAt);
    }
    return true; // Nothing to save
  }, [save, cancelPendingSave]);

  const scheduleAutoSave = useCallback((
    data: AutoSaveData,
    lastKnownUpdatedAt?: string
  ) => {
    cancelPendingSave();
    pendingDataRef.current = { data, lastKnownUpdatedAt };

    timerRef.current = setTimeout(() => {
      if (pendingDataRef.current) {
        const { data: pendingData, lastKnownUpdatedAt: pendingUpdatedAt } = pendingDataRef.current;
        pendingDataRef.current = null;
        save(pendingData, pendingUpdatedAt);
      }
    }, debounceMs);
  }, [debounceMs, save, cancelPendingSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelPendingSave();
    };
  }, [cancelPendingSave]);

  return {
    saveStatus,
    error,
    lastSavedAt,
    save,
    forceSave,
    scheduleAutoSave,
    cancelPendingSave,
  };
}
