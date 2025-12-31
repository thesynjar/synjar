import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { SearchLinksTab } from '@/features/search-links';
import { InstructionSetsTab } from '@/features/instruction-sets';
import { DocumentListPanel } from '@/features/documents';
import { useLastWorkspace } from './hooks';
import { useWorkspaceUI } from '@/shared/contexts';
import { toast } from '@/shared/ui';

type TabType = 'documents' | 'search-links' | 'instruction-sets';

interface Workspace {
  id: string;
  name: string;
  description: string | null;
}

export function WorkspaceDetail() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [searchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabType) || 'documents';

  const { isMultiWorkspace } = useWorkspaceUI();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setLastWorkspace } = useLastWorkspace();

  const authStore = useAuthStore();

  const apiClient = useMemo(() => createApiClient({
    getAccessToken: authStore.getAccessToken,
    getRefreshToken: authStore.getRefreshToken,
    setTokens: authStore.setTokens,
    clearTokens: authStore.clearTokens,
    getWorkspaceId: () => workspaceId || null,
  }), [authStore, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;

    setLastWorkspace(workspaceId);
    const fetchWorkspace = async () => {
      setIsLoading(true);
      try {
        const wsData = await apiClient.get(`workspaces/${workspaceId}`).json<Workspace>();
        setWorkspace(wsData);
      } catch {
        toast.error('Failed to load workspace data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkspace();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl text-white mb-4">Workspace not found</h2>
        <Link to="/workspaces" className="text-blue-400 hover:text-blue-300">
          Back to workspaces
        </Link>
      </div>
    );
  }

  return (
    <div>
      {(isMultiWorkspace || workspace.description) && (
        <div className="mb-6">
          {isMultiWorkspace && (
            <Link
              to="/workspaces"
              className="text-slate-400 hover:text-white text-sm mb-2 inline-flex items-center gap-1"
              aria-label="Return to workspaces list"
            >
              <span aria-hidden="true">←</span>
              Back to workspaces
            </Link>
          )}
          {workspace.description && (
            <p className="text-slate-400">{workspace.description}</p>
          )}
        </div>
      )}

      {activeTab === 'search-links' && (
        <SearchLinksTab workspaceId={workspaceId!} workspaceName={workspace.name} />
      )}

      {activeTab === 'instruction-sets' && (
        <InstructionSetsTab workspaceId={workspaceId!} />
      )}

      {activeTab === 'documents' && (
        <DocumentListPanel workspaceId={workspaceId!} />
      )}
    </div>
  );
}
