import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    post: (path: string, options: { json: object }) => { json: <T>() => Promise<T> };
  };
  debounceMs?: number; // default 2000
  maxRetries?: number; // default 3
  endpoint?: 'save-draft' | 'patch'; // default 'patch' for backward compatibility
  // Use ref to always get the latest expectedUpdatedAt when saving
  // This prevents stale closures when rapid typing causes overlapping saves
  expectedUpdatedAtRef?: React.RefObject<string | null>;
  onSaved?: (updatedAt: string) => void;
  onConflict?: (serverUpdatedAt: string) => void;
  onError?: (error: string) => void;
}

interface UseAutoSaveResult {
  saveStatus: SaveStatus;
  error: string | null;
  lastSavedAt: string | null;
  save: (data: AutoSaveData, expectedUpdatedAt?: string) => Promise<boolean>;
  forceSave: () => Promise<boolean>;
  scheduleAutoSave: (data: AutoSaveData, expectedUpdatedAt?: string) => void;
  cancelPendingSave: () => void;
}

export function useAutoSave({
  workspaceId,
  documentId,
  apiClient,
  debounceMs = 2000,
  maxRetries = 3,
  endpoint = 'patch',
  expectedUpdatedAtRef,
  onSaved,
  onConflict,
  onError,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Only store data, not expectedUpdatedAt - use ref to get current value when saving
  const pendingDataRef = useRef<{ data: AutoSaveData; expectedUpdatedAt?: string } | null>(null);
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
    expectedUpdatedAt?: string
  ): Promise<boolean> => {
    setSaveStatus('saving');
    setError(null);

    try {
      const endpointPath = endpoint === 'save-draft'
        ? `${basePath}/save-draft`
        : basePath;

      const method = endpoint === 'save-draft' ? 'post' : 'patch';

      // For save-draft endpoint, include metadata that should persist before publish
      const requestData = endpoint === 'save-draft'
        ? {
            title: data.title,
            content: data.content,
            sourceDescription: data.sourceDescription,
            verificationStatus: data.verificationStatus,
            purpose: data.purpose,
            tags: data.tags,
            expectedUpdatedAt,
          }
        : {
            ...data,
            expectedUpdatedAt,
          };

      const response = await apiClient[method](endpointPath, {
        json: requestData,
      }).json<{ updatedAt: string; hasDraft?: boolean; draftUpdatedAt?: string | null }>();

      setSaveStatus('saved');
      setLastSavedAt(response.updatedAt);
      retryCountRef.current = 0;

      // IMPORTANT: Update expectedUpdatedAt immediately after successful save
      // This prevents stale expectedUpdatedAt causing 409 CONFLICT on next save
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
          save(data, expectedUpdatedAt);
        }, delay);
        return false;
      }

      setSaveStatus('error');
      const errorMessage = 'Failed to save document';
      setError(errorMessage);
      onError?.(errorMessage);
      return false;
    }
  }, [apiClient, basePath, endpoint, maxRetries, onSaved, onConflict, onError]);

  const forceSave = useCallback(async (): Promise<boolean> => {
    if (pendingDataRef.current) {
      const { data, expectedUpdatedAt: fallbackUpdatedAt } = pendingDataRef.current;
      cancelPendingSave();
      // Use ref value if available, otherwise use fallback
      const currentExpectedUpdatedAt = expectedUpdatedAtRef?.current ?? fallbackUpdatedAt;
      return save(data, currentExpectedUpdatedAt ?? undefined);
    }
    return true; // Nothing to save
  }, [save, cancelPendingSave, expectedUpdatedAtRef]);

  const scheduleAutoSave = useCallback((
    data: AutoSaveData,
    expectedUpdatedAt?: string
  ) => {
    cancelPendingSave();
    // Store data and fallback expectedUpdatedAt (used when ref is not provided)
    pendingDataRef.current = { data, expectedUpdatedAt };

    timerRef.current = setTimeout(() => {
      if (pendingDataRef.current) {
        const { data: pendingData, expectedUpdatedAt: fallbackUpdatedAt } = pendingDataRef.current;
        pendingDataRef.current = null;
        // CRITICAL: Use ref value (always current) if available, otherwise use fallback
        // This prevents 409 CONFLICT when rapid typing causes overlapping saves
        const currentExpectedUpdatedAt = expectedUpdatedAtRef?.current ?? fallbackUpdatedAt;
        save(pendingData, currentExpectedUpdatedAt ?? undefined);
      }
    }, debounceMs);
  }, [debounceMs, save, cancelPendingSave, expectedUpdatedAtRef]);

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
