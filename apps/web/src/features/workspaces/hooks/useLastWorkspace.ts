import { useCallback } from 'react';
import { isValidUUID } from '../../../shared/utils';

/**
 * Hook to persist and retrieve the last visited workspace ID.
 *
 * Security: UUID validation for defense in depth against XSS payload persistence.
 * See: docs/specifications/2025-12-30-navigation-redesign.md
 */

const LAST_WORKSPACE_KEY = 'synjar:lastWorkspaceId';

export function useLastWorkspace() {
  const setLastWorkspace = useCallback((workspaceId: string) => {
    // Validate UUID before storing (prevent XSS payload persistence)
    if (!isValidUUID(workspaceId)) {
      console.error('Attempted to store invalid workspace ID:', workspaceId);
      return;
    }
    localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
  }, []);

  const getLastWorkspace = useCallback((): string | null => {
    const id = localStorage.getItem(LAST_WORKSPACE_KEY);

    // Validate on read (defense in depth)
    if (id && !isValidUUID(id)) {
      console.warn('Corrupted workspace ID in localStorage, clearing');
      localStorage.removeItem(LAST_WORKSPACE_KEY);
      return null;
    }

    return id;
  }, []);

  const clearLastWorkspace = useCallback(() => {
    localStorage.removeItem(LAST_WORKSPACE_KEY);
  }, []);

  return { setLastWorkspace, getLastWorkspace, clearLastWorkspace };
}
