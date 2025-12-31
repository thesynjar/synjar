import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { toast } from '@/shared/ui';

const BACKUP_KEY = 'document-draft-backup';
const BACKUP_INTERVAL = 10000; // 10 seconds
const MAX_BACKUP_AGE = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BACKUP_SIZE = 5 * 1024 * 1024; // 5 MB

export interface DocumentBackup {
  title: string;
  content: string;
  savedAt: string;
}

export interface RecoveryResult {
  type: 'no_backup' | 'use_server' | 'conflict';
  localBackup?: DocumentBackup;
  serverDraftUpdatedAt?: Date | null;
}

export function useDocumentBackup(
  docId: string,
  title: string,
  content: string
): {
  checkRecovery: (serverDraftUpdatedAt: Date | null) => RecoveryResult;
  clearBackup: () => void;
  backupEnabled: boolean;
} {
  const [backupEnabled, setBackupEnabled] = useState(true);

  const saveBackup = useCallback((docId: string, title: string, content: string): boolean => {
    const backup: DocumentBackup = {
      title: DOMPurify.sanitize(title),
      content: DOMPurify.sanitize(content),
      savedAt: new Date().toISOString(),
    };

    const serialized = JSON.stringify(backup);

    // Size limit check
    if (serialized.length > MAX_BACKUP_SIZE) {
      toast.warning('Document too large for local backup. Save to server regularly.', 5000);
      return false;
    }

    try {
      localStorage.setItem(`${BACKUP_KEY}:${docId}`, serialized);
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        toast.error('Local storage full. Save to server to prevent data loss.', 10000);
      }
      return false;
    }
  }, []);

  const getBackup = useCallback((docId: string): DocumentBackup | null => {
    try {
      const raw = localStorage.getItem(`${BACKUP_KEY}:${docId}`);
      if (!raw) return null;

      const backup: DocumentBackup = JSON.parse(raw);
      const age = Date.now() - new Date(backup.savedAt).getTime();

      if (age > MAX_BACKUP_AGE) {
        localStorage.removeItem(`${BACKUP_KEY}:${docId}`);
        return null;
      }

      // XSS Prevention - sanitize on read
      return {
        title: DOMPurify.sanitize(backup.title),
        content: DOMPurify.sanitize(backup.content),
        savedAt: backup.savedAt,
      };
    } catch (e) {
      localStorage.removeItem(`${BACKUP_KEY}:${docId}`);
      return null;
    }
  }, []);

  const checkRecovery = useCallback((serverDraftUpdatedAt: Date | null): RecoveryResult => {
    const backup = getBackup(docId);

    if (!backup) {
      return { type: 'no_backup' };
    }

    const backupDate = new Date(backup.savedAt);

    // Server draft has priority
    if (serverDraftUpdatedAt && serverDraftUpdatedAt >= backupDate) {
      localStorage.removeItem(`${BACKUP_KEY}:${docId}`);
      return { type: 'use_server' };
    }

    // Local backup is newer
    return {
      type: 'conflict',
      localBackup: backup,
      serverDraftUpdatedAt,
    };
  }, [docId, getBackup]);

  const clearBackup = useCallback(() => {
    localStorage.removeItem(`${BACKUP_KEY}:${docId}`);
    setBackupEnabled(true);
  }, [docId]);

  // Auto-save to localStorage every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      const success = saveBackup(docId, title, content);
      setBackupEnabled(success);
    }, BACKUP_INTERVAL);

    return () => clearInterval(interval);
  }, [docId, title, content, saveBackup]);

  return { checkRecovery, clearBackup, backupEnabled };
}
