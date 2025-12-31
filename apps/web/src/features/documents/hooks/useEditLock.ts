import { useState, useEffect, useCallback, useRef } from 'react';

export type LockStatus = 'unlocked' | 'locked_by_me' | 'locked_by_other' | 'acquiring' | 'error';

interface LockInfo {
  lockedBy?: string;
  lockedUntil?: string;
}

interface UseEditLockOptions {
  workspaceId: string;
  documentId: string;
  apiClient: {
    post: (path: string) => { json: <T>() => Promise<T> };
    put: (path: string) => { json: <T>() => Promise<T> };
    delete: (path: string) => Promise<void>;
  };
  // Called when lock is acquired with the new updatedAt timestamp
  // This allows the caller to update expectedUpdatedAt to prevent CONFLICT errors
  onLockAcquired?: (updatedAt: string) => void;
  // Called after each heartbeat with the new updatedAt timestamp
  // This prevents 409 CONFLICT when heartbeat updates document.updatedAt
  onHeartbeat?: (updatedAt: string) => void;
  onLockLost?: () => void;
  heartbeatInterval?: number; // ms, default 30000
}

interface UseEditLockResult {
  lockStatus: LockStatus;
  lockInfo: LockInfo | null;
  error: string | null;
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
}

export function useEditLock({
  workspaceId,
  documentId,
  apiClient,
  onLockAcquired,
  onHeartbeat,
  onLockLost,
  heartbeatInterval = 30000,
}: UseEditLockOptions): UseEditLockResult {
  const [lockStatus, setLockStatus] = useState<LockStatus>('unlocked');
  const [lockInfo, setLockInfo] = useState<LockInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const isReleasingRef = useRef(false);

  const basePath = `workspaces/${workspaceId}/documents/${documentId}/lock`;

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatRef.current = setInterval(async () => {
      try {
        const response = await apiClient.put(basePath).json<{ lockedUntil: string; updatedAt: string }>();
        // Update expectedUpdatedAt after each heartbeat to prevent CONFLICT
        onHeartbeat?.(response.updatedAt);
      } catch (err) {
        console.error('Heartbeat failed:', err);
        setLockStatus('error');
        setError('Lock expired or lost');
        stopHeartbeat();
        onLockLost?.();
      }
    }, heartbeatInterval);
  }, [apiClient, basePath, heartbeatInterval, stopHeartbeat, onLockLost, onHeartbeat]);

  const acquireLock = useCallback(async (): Promise<boolean> => {
    setLockStatus('acquiring');
    setError(null);

    try {
      const response = await apiClient.post(basePath).json<{ lockedUntil: string; updatedAt: string }>();
      setLockStatus('locked_by_me');
      setLockInfo({ lockedUntil: response.lockedUntil });
      startHeartbeat();
      // Pass updatedAt so caller can update expectedUpdatedAt and prevent CONFLICT
      onLockAcquired?.(response.updatedAt);
      return true;
    } catch (err: unknown) {
      const errorData = (err as { response?: { json?: () => Promise<{ error?: string; lockedBy?: string; lockedUntil?: string }> } })?.response;
      if (errorData?.json) {
        try {
          const data = await errorData.json();
          if (data.error === 'DOCUMENT_LOCKED') {
            setLockStatus('locked_by_other');
            setLockInfo({ lockedBy: data.lockedBy, lockedUntil: data.lockedUntil });
            setError(`Document is being edited by ${data.lockedBy}`);
            return false;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
      setLockStatus('error');
      setError('Failed to acquire lock');
      return false;
    }
  }, [apiClient, basePath, startHeartbeat, onLockAcquired]);

  const releaseLock = useCallback(async (): Promise<void> => {
    if (isReleasingRef.current) return;
    isReleasingRef.current = true;

    stopHeartbeat();

    if (lockStatus === 'locked_by_me') {
      try {
        await apiClient.delete(basePath);
      } catch (err) {
        console.error('Failed to release lock:', err);
      }
    }

    setLockStatus('unlocked');
    setLockInfo(null);
    isReleasingRef.current = false;
  }, [apiClient, basePath, lockStatus, stopHeartbeat]);

  // Auto-acquire lock on mount
  useEffect(() => {
    acquireLock();

    // Release lock on unmount
    return () => {
      stopHeartbeat();
      if (lockStatus === 'locked_by_me' && !isReleasingRef.current) {
        isReleasingRef.current = true;
        apiClient.delete(basePath).catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    lockStatus,
    lockInfo,
    error,
    acquireLock,
    releaseLock,
  };
}
