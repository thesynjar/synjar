import { useState, useEffect, useMemo } from 'react';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { SearchLink, Tag } from './types';
import { SearchLinkCard } from './SearchLinkCard';
import { CreateSearchLinkModal } from './CreateSearchLinkModal';
import { SuccessModal } from './SuccessModal';
import { EmptyState } from './EmptyState';

interface SearchLinksTabProps {
  workspaceId: string;
  workspaceName: string;
}

export function SearchLinksTab({ workspaceId, workspaceName }: SearchLinksTabProps) {
  const [links, setLinks] = useState<SearchLink[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdLink, setCreatedLink] = useState<SearchLink | null>(null);

  const authStore = useAuthStore();

  const apiClient = useMemo(() => createApiClient({
    getAccessToken: authStore.getAccessToken,
    getRefreshToken: authStore.getRefreshToken,
    setTokens: authStore.setTokens,
    clearTokens: authStore.clearTokens,
    getWorkspaceId: () => workspaceId,
  }), [authStore, workspaceId]);

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [linksData, tagsData] = await Promise.all([
        apiClient.get(`workspaces/${workspaceId}/public-links`).json<SearchLink[]>(),
        apiClient.get(`workspaces/${workspaceId}/tags`).json<Tag[]>().catch(() => []),
      ]);
      setLinks(linksData);
      setTags(tagsData);
    } catch (err) {
      console.error('Failed to fetch search links:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (data: { name?: string; allowedTags?: string[]; expiresAt?: string }) => {
    try {
      const newLink = await apiClient.post(`workspaces/${workspaceId}/public-links`, {
        json: data,
      }).json<SearchLink>();

      setShowCreateModal(false);
      setCreatedLink(newLink);
      await fetchData();
    } catch (err) {
      console.error('Failed to create search link:', err);
      throw err;
    }
  };

  const handleRevoke = async (linkId: string) => {
    if (!confirm('Are you sure you want to revoke this link? AI systems using it will no longer be able to search your knowledge base.')) {
      return;
    }

    try {
      await apiClient.delete(`workspaces/${workspaceId}/public-links/${linkId}`);
      await fetchData();
    } catch (err) {
      console.error('Failed to revoke link:', err);
      alert('Failed to revoke link. Please try again.');
    }
  };

  const activeLinks = links.filter(link => link.isActive);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {activeLinks.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreateModal(true)} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">
              Search Links ({activeLinks.length} active)
            </h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors flex items-center gap-2 cursor-pointer"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Link
            </button>
          </div>

          <div className="space-y-4">
            {activeLinks.map((link) => (
              <SearchLinkCard
                key={link.id}
                link={link}
                onRevoke={() => handleRevoke(link.id)}
              />
            ))}
          </div>
        </>
      )}

      {showCreateModal && (
        <CreateSearchLinkModal
          tags={tags}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}

      {createdLink && (
        <SuccessModal
          link={createdLink}
          workspaceName={workspaceName}
          onClose={() => setCreatedLink(null)}
        />
      )}
    </div>
  );
}
