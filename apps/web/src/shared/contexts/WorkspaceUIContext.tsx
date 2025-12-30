import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { useLastWorkspace } from '@/features/workspaces/hooks';
import { isValidUUID } from '@/shared/utils';
import { toast } from '@/shared/ui';

/**
 * WorkspaceUIContext - UI state management for workspace navigation
 *
 * NOTE: This is React Context API for UI state, NOT the DDD Workspace Bounded Context.
 * For domain logic, see: community/apps/api/src/domain/workspace/
 *
 * See: docs/specifications/2025-12-30-navigation-redesign.md
 */

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
}

interface WorkspaceUIContextValue {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  workspaceCount: number;
  isLoading: boolean;
  error: Error | null;
  switchWorkspace: (workspaceId: string) => void;
  isMultiWorkspace: boolean;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceUIContext = createContext<WorkspaceUIContextValue | null>(null);

interface WorkspaceUIProviderProps {
  children: ReactNode;
}

export function WorkspaceUIProvider({ children }: WorkspaceUIProviderProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const authStore = useAuthStore();
  const { setLastWorkspace, clearLastWorkspace } = useLastWorkspace();

  const apiClient = useMemo(
    () =>
      createApiClient({
        getAccessToken: authStore.getAccessToken,
        getRefreshToken: authStore.getRefreshToken,
        setTokens: authStore.setTokens,
        clearTokens: authStore.clearTokens,
        getWorkspaceId: () => workspaceId || null,
      }),
    [authStore, workspaceId]
  );

  const fetchWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get('workspaces').json<Workspace[]>();
      setWorkspaces(data);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      setError(err instanceof Error ? err : new Error('Failed to load workspaces'));
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const currentWorkspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) || null,
    [workspaces, workspaceId]
  );

  // H3: UUID validation before navigation (defense in depth)
  const switchWorkspace = useCallback(
    (id: string) => {
      if (!isValidUUID(id)) {
        console.error('Invalid workspace ID format:', id);
        toast.error('Invalid workspace. Please contact support.');
        return;
      }

      // H7: Validate workspace exists in user's workspaces
      const workspaceExists = workspaces.find((w) => w.id === id);
      if (!workspaceExists) {
        console.error('Workspace not found:', id);
        clearLastWorkspace(); // Clear stale localStorage
        toast.error('Workspace not found.');
        return;
      }

      setLastWorkspace(id);
      navigate(`/workspaces/${id}`);
    },
    [navigate, setLastWorkspace, clearLastWorkspace, workspaces]
  );

  // Handle error state - provide empty context to not break the app
  if (error) {
    return (
      <WorkspaceUIContext.Provider
        value={{
          currentWorkspace: null,
          workspaces: [],
          workspaceCount: 0,
          isLoading: false,
          error,
          switchWorkspace: () => {},
          isMultiWorkspace: false,
          refreshWorkspaces: fetchWorkspaces,
        }}
      >
        {children}
      </WorkspaceUIContext.Provider>
    );
  }

  const value: WorkspaceUIContextValue = useMemo(
    () => ({
      currentWorkspace,
      workspaces,
      workspaceCount: workspaces.length,
      isLoading,
      error,
      switchWorkspace,
      isMultiWorkspace: workspaces.length > 1,
      refreshWorkspaces: fetchWorkspaces,
    }),
    [currentWorkspace, workspaces, isLoading, error, switchWorkspace, fetchWorkspaces]
  );

  return <WorkspaceUIContext.Provider value={value}>{children}</WorkspaceUIContext.Provider>;
}

export function useWorkspaceUI() {
  const context = useContext(WorkspaceUIContext);
  if (!context) {
    throw new Error('useWorkspaceUI must be used within WorkspaceUIProvider');
  }
  return context;
}
