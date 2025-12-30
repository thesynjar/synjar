import { useState, useEffect, useMemo } from 'react';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { InstructionSet, InstructionSetListResponse, Document } from './types';
import { InstructionSetCard } from './InstructionSetCard';
import { CreateInstructionSetModal } from './CreateInstructionSetModal';
import { EmptyState } from './EmptyState';

interface InstructionSetsTabProps {
  workspaceId: string;
}

interface DocumentListResponse {
  documents: Document[];
}

export function InstructionSetsTab({ workspaceId }: InstructionSetsTabProps) {
  const [sets, setSets] = useState<InstructionSet[]>([]);
  const [meta, setMeta] = useState({ count: 0, limit: 50, remaining: 50 });
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      const [setsData, docsData] = await Promise.all([
        apiClient.get(`workspaces/${workspaceId}/instruction-sets`).json<InstructionSetListResponse>(),
        apiClient.get(`workspaces/${workspaceId}/documents?verificationStatus=VERIFIED`).json<DocumentListResponse>().catch(() => ({ documents: [] })),
      ]);
      setSets(setsData.data);
      setMeta(setsData.meta);
      setDocuments(docsData.documents);
    } catch (err) {
      console.error('Failed to fetch instruction sets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (data: { name: string; description?: string; documentIds?: string[] }) => {
    try {
      await apiClient.post(`workspaces/${workspaceId}/instruction-sets`, {
        json: data,
      }).json<InstructionSet>();

      setShowCreateModal(false);
      await fetchData();
    } catch (err) {
      console.error('Failed to create instruction set:', err);
      throw err;
    }
  };

  const handleDelete = async (setId: string) => {
    if (!confirm('Are you sure you want to delete this instruction set? The public link will stop working.')) {
      return;
    }

    try {
      await apiClient.delete(`workspaces/${workspaceId}/instruction-sets/${setId}`);
      await fetchData();
    } catch (err) {
      console.error('Failed to delete instruction set:', err);
      alert('Failed to delete instruction set. Please try again.');
    }
  };

  const handleTogglePublic = async (setId: string, isPublic: boolean) => {
    try {
      await apiClient.patch(`workspaces/${workspaceId}/instruction-sets/${setId}`, {
        json: { isPublic },
      }).json();
      await fetchData();
    } catch (err) {
      console.error('Failed to update instruction set:', err);
      alert('Failed to update instruction set. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {sets.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreateModal(true)} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Instruction Sets ({meta.count})
              </h2>
              <p className="text-sm text-slate-400">
                {meta.remaining} remaining of {meta.limit} limit
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={meta.remaining === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Set
            </button>
          </div>

          <div className="space-y-4">
            {sets.map((set) => (
              <InstructionSetCard
                key={set.id}
                set={set}
                onDelete={() => handleDelete(set.id)}
                onTogglePublic={(isPublic) => handleTogglePublic(set.id, isPublic)}
              />
            ))}
          </div>
        </>
      )}

      {showCreateModal && (
        <CreateInstructionSetModal
          documents={documents}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
