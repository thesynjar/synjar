import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { toast } from '@/shared/ui';
import { DocumentPurpose } from '@/shared/types/document.types';
import { DocumentFilters } from './DocumentFilters';
import { DocumentRow } from './DocumentRow';
import { DocumentUploadModal } from './DocumentUploadModal';
import { NewDocumentModal } from './NewDocumentModal';
import { useDocumentList } from '../hooks/useDocumentList';
import { PROCESSING_STATUSES, VERIFICATION_STATUSES } from '../types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

interface DocumentListPanelProps {
  workspaceId: string;
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validateEnum<T extends string>(value: string | null, validValues: readonly T[]): T | null {
  if (!value) return null;
  return validValues.includes(value as T) ? (value as T) : null;
}

export function DocumentListPanel({ workspaceId }: DocumentListPanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const authStore = useAuthStore();

  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showNewDocModal, setShowNewDocModal] = useState(false);

  const verificationStatus = validateEnum(searchParams.get('verificationStatus'), VERIFICATION_STATUSES);
  const processingStatus = validateEnum(searchParams.get('processingStatus'), PROCESSING_STATUSES);
  const page = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE);
  const includePage = searchParams.has('page');
  const hasActiveFilters = Boolean(verificationStatus || processingStatus);

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

  const {
    documents,
    pagination,
    isLoading,
    loadError,
    refresh: fetchDocuments,
  } = useDocumentList({
    apiClient,
    workspaceId,
    verificationStatus,
    processingStatus,
    page,
    includePage,
    limit: DEFAULT_LIMIT,
  });

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', file.name);
      formData.append('file', file);

      await apiClient.post(`workspaces/${workspaceId}/documents`, {
        body: formData,
      }).json();

      await fetchDocuments();
      setShowUploadModal(false);
    } catch {
      toast.error('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateTextDocument = async (title: string, content: string, purpose: DocumentPurpose) => {
    try {
      await apiClient.post(`workspaces/${workspaceId}/documents`, {
        json: { title, content, purpose },
      }).json();

      setShowNewDocModal(false);
      await fetchDocuments();
    } catch {
      toast.error('Failed to create document. Please try again.');
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await apiClient.delete(`workspaces/${workspaceId}/documents/${documentId}`);
      await fetchDocuments();
    } catch {
      toast.error('Failed to delete document. Please try again.');
    }
  };

  return (
    <div>
      <DocumentFilters
        totalCount={pagination.total}
        verificationStatus={verificationStatus}
        processingStatus={processingStatus}
        onUploadClick={() => setShowUploadModal(true)}
        onNewTextClick={() => setShowNewDocModal(true)}
      />

      <div className="bg-slate-800 rounded-xl border border-slate-700">
        {isLoading ? (
          <DocumentListSkeleton />
        ) : loadError ? (
          <div className="p-8 text-center text-slate-400">
            <p className="mb-4">Failed to load documents.</p>
            <button
              type="button"
              onClick={fetchDocuments}
              className="px-4 py-2 border border-slate-600 text-slate-200 rounded-lg hover:border-slate-500 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            {hasActiveFilters ? (
              <>
                <p className="mb-4">No documents match filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    const resetParams = new URLSearchParams(searchParams);
                    resetParams.delete('verificationStatus');
                    resetParams.delete('processingStatus');
                    resetParams.set('page', '1');
                    setSearchParams(resetParams);
                  }}
                  className="px-4 py-2 border border-slate-600 text-slate-200 rounded-lg hover:border-slate-500 transition-colors"
                >
                  Reset filters
                </button>
              </>
            ) : (
              <>
                <p className="mb-2">No documents yet.</p>
                <p className="text-sm text-slate-500 mb-4">
                  Upload a file or create a text document to get started.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(true)}
                    className="px-4 py-2 border border-slate-600 text-slate-200 rounded-lg hover:border-slate-500 transition-colors"
                  >
                    Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewDocModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
                  >
                    New Text
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                document={doc}
                workspaceId={workspaceId}
                onDelete={() => handleDeleteDocument(doc.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showUploadModal && (
        <DocumentUploadModal
          isUploading={isUploading}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleFileUpload}
        />
      )}

      {showNewDocModal && (
        <NewDocumentModal
          onClose={() => setShowNewDocModal(false)}
          onCreate={handleCreateTextDocument}
        />
      )}
    </div>
  );
}

function DocumentListSkeleton() {
  return (
    <div className="divide-y divide-slate-700">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="p-4 animate-pulse space-y-3">
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 rounded bg-slate-700/60" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 bg-slate-700/60 rounded" />
              <div className="h-3 w-1/3 bg-slate-700/40 rounded" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-5 w-20 bg-slate-700/50 rounded-full" />
            <div className="h-5 w-20 bg-slate-700/50 rounded-full" />
            <div className="h-5 w-24 bg-slate-700/50 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
