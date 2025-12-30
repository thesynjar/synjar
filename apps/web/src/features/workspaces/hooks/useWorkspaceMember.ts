import { useState, useEffect, useMemo } from 'react';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';

interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

interface UseWorkspaceMemberParams {
  workspaceId: string | undefined;
}

interface UseWorkspaceMemberResult {
  /** Current user's membership in the workspace */
  member: WorkspaceMember | null;
  /** Current user's role in the workspace */
  role: WorkspaceRole | null;
  /** Whether data is being loaded */
  isLoading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Check if user can edit (OWNER or ADMIN) */
  canEdit: boolean;
}

/**
 * Hook to fetch and check current user's workspace membership.
 * Used for RBAC checks in the frontend for better UX.
 *
 * Note: Backend still enforces authorization - this is for UI feedback only.
 */
export function useWorkspaceMember({
  workspaceId,
}: UseWorkspaceMemberParams): UseWorkspaceMemberResult {
  const authStore = useAuthStore();

  const [member, setMember] = useState<WorkspaceMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    const fetchMembership = async () => {
      if (!workspaceId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Fetch current user and workspace members in parallel
        const [currentUser, members] = await Promise.all([
          apiClient.get('auth/me').json<AuthenticatedUser>(),
          apiClient.get(`workspaces/${workspaceId}/members`).json<WorkspaceMember[]>(),
        ]);

        // Find current user's membership
        const currentMember = members.find((m) => m.userId === currentUser.id);
        setMember(currentMember || null);
      } catch (err) {
        console.error('Failed to fetch workspace membership:', err);
        setError('Failed to verify workspace membership');
        setMember(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembership();
  }, [apiClient, workspaceId]);

  const role = member?.role || null;
  const canEdit = role === 'OWNER' || role === 'ADMIN';

  return {
    member,
    role,
    isLoading,
    error,
    canEdit,
  };
}
