import { useState, useEffect, useMemo } from 'react';
import { createApiClient } from '../../shared/api/client';
import { useAuthStore } from '../auth/model/authStore';

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
}

export function Dashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const authStore = useAuthStore();

  // Create API client with token provider from auth store
  const apiClient = useMemo(() => createApiClient({
    getAccessToken: authStore.getAccessToken,
    getRefreshToken: authStore.getRefreshToken,
    setTokens: authStore.setTokens,
    clearTokens: authStore.clearTokens,
    getWorkspaceId: authStore.getWorkspaceId,
  }), [authStore]);

  useEffect(() => {
    fetchWorkspaces();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchWorkspaces = async () => {
    try {
      const data = await apiClient.get('workspaces').json<Workspace[]>();
      setWorkspaces(data);
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Workspaces</h1>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors">
          New Workspace
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : workspaces.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  return (
    <div className="p-6 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer">
      <h3 className="text-lg font-semibold text-white mb-2">{workspace.name}</h3>
      {workspace.description && (
        <p className="text-slate-400 text-sm mb-4">{workspace.description}</p>
      )}
      <div className="text-slate-500 text-sm">
        {workspace.documentCount} documents
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="text-slate-500 mb-4">
        <svg
          className="mx-auto h-12 w-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-white mb-2">No workspaces yet</h3>
      <p className="text-slate-400 mb-6">
        Create your first workspace to start building your knowledge base.
      </p>
      <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors">
        Create Workspace
      </button>
    </div>
  );
}
