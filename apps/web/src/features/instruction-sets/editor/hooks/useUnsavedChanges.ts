import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseUnsavedChangesParams {
  workspaceId: string | undefined;
  hasUnsavedChanges: boolean;
}

interface UseUnsavedChangesResult {
  handleBack: () => void;
}

export function useUnsavedChanges({
  workspaceId,
  hasUnsavedChanges,
}: UseUnsavedChangesParams): UseUnsavedChangesResult {
  const navigate = useNavigate();

  // beforeunload listener to warn about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        // Modern browsers require returnValue to be set
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
      if (!confirmed) return;
    }
    navigate(`/workspaces/${workspaceId}?tab=instruction-sets`);
  }, [hasUnsavedChanges, navigate, workspaceId]);

  return {
    handleBack,
  };
}
