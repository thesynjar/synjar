import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { SearchLinksTab } from '@/features/search-links';

type TabType = 'documents' | 'search-links';

type ContentType = 'TEXT' | 'FILE';
type VerificationStatus = 'VERIFIED' | 'UNVERIFIED';
type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface Document {
  id: string;
  title: string;
  content: string;
  contentType: ContentType;
  originalFilename: string | null;
  fileSize: number | null;
  verificationStatus: VerificationStatus;
  processingStatus: ProcessingStatus;
  createdAt: string;
  tags: Array<{ tag: { id: string; name: string } }>;
}

interface DocumentListResponse {
  documents: Document[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface Workspace {
  id: string;
  name: string;
  description: string | null;
}

export function WorkspaceDetail() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabType) || 'documents';

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setActiveTab = (tab: TabType) => {
    setSearchParams({ tab });
  };

  const authStore = useAuthStore();

  const apiClient = useMemo(() => createApiClient({
    getAccessToken: authStore.getAccessToken,
    getRefreshToken: authStore.getRefreshToken,
    setTokens: authStore.setTokens,
    clearTokens: authStore.clearTokens,
    getWorkspaceId: () => workspaceId || null,
  }), [authStore, workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [wsData, docsData] = await Promise.all([
        apiClient.get(`workspaces/${workspaceId}`).json<Workspace>(),
        apiClient.get(`workspaces/${workspaceId}/documents`).json<DocumentListResponse>(),
      ]);
      setWorkspace(wsData);
      setDocuments(docsData.documents);
      setPagination(docsData.pagination);
    } catch (err) {
      console.error('Failed to fetch workspace data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!workspaceId) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', file.name);
      formData.append('file', file);

      await apiClient.post(`workspaces/${workspaceId}/documents`, {
        body: formData,
      }).json();

      await fetchData();
    } catch (err) {
      console.error('Failed to upload file:', err);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCreateTextDocument = async (title: string, content: string) => {
    if (!workspaceId) return;

    try {
      await apiClient.post(`workspaces/${workspaceId}/documents`, {
        json: { title, content },
      }).json();

      setShowNewDocModal(false);
      await fetchData();
    } catch (err) {
      console.error('Failed to create document:', err);
      alert('Failed to create document. Please try again.');
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!workspaceId || !confirm('Are you sure you want to delete this document?')) return;

    try {
      await apiClient.delete(`workspaces/${workspaceId}/documents/${documentId}`);
      await fetchData();
    } catch (err) {
      console.error('Failed to delete document:', err);
      alert('Failed to delete document. Please try again.');
    }
  };

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
      <div className="mb-6">
        <Link to="/workspaces" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
          ← Back to workspaces
        </Link>
        <h1 className="text-2xl font-bold text-white">{workspace.name}</h1>
        {workspace.description && (
          <p className="text-slate-400 mt-1">{workspace.description}</p>
        )}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-slate-700 mb-6">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('documents')}
            className={`pb-3 px-1 text-sm font-medium transition-colors relative cursor-pointer ${
              activeTab === 'documents'
                ? 'text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Documents
            {activeTab === 'documents' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('search-links')}
            className={`pb-3 px-1 text-sm font-medium transition-colors relative cursor-pointer ${
              activeTab === 'search-links'
                ? 'text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Search Links
            {activeTab === 'search-links' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'search-links' ? (
        <SearchLinksTab workspaceId={workspaceId!} workspaceName={workspace.name} />
      ) : (
        <>
          {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="mb-8 border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-slate-500 transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          onChange={handleFileSelect}
          className="hidden"
        />
        {isUploading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
            <span className="text-slate-400">Uploading...</span>
          </div>
        ) : (
          <>
            <svg className="mx-auto h-10 w-10 text-slate-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-slate-400 mb-2">
              Drag & drop files here, or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-400 hover:text-blue-300"
              >
                browse
              </button>
            </p>
            <p className="text-slate-500 text-sm">PDF, DOCX, TXT, MD up to 100MB</p>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setShowNewDocModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
        >
          New Text Document
        </button>
      </div>

      {/* Documents list */}
      <div className="bg-slate-800 rounded-xl border border-slate-700">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">
            Documents ({pagination.total})
          </h2>
        </div>
        {documents.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No documents yet. Upload a file or create a text document to get started.
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                document={doc}
                workspaceId={workspaceId!}
                onDelete={() => handleDeleteDocument(doc.id)}
              />
            ))}
          </div>
        )}
      </div>

          {/* New Document Modal */}
          {showNewDocModal && (
            <NewDocumentModal
              onClose={() => setShowNewDocModal(false)}
              onCreate={handleCreateTextDocument}
            />
          )}
        </>
      )}
    </div>
  );
}

function DocumentRow({ document, workspaceId, onDelete }: { document: Document; workspaceId: string; onDelete: () => void }) {
  const navigate = useNavigate();

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: ProcessingStatus) => {
    const styles = {
      PENDING: 'bg-yellow-500/20 text-yellow-400',
      PROCESSING: 'bg-blue-500/20 text-blue-400',
      COMPLETED: 'bg-green-500/20 text-green-400',
      FAILED: 'bg-red-500/20 text-red-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs ${styles[status]}`}>
        {status.toLowerCase()}
      </span>
    );
  };

  const handleClick = () => {
    navigate(`/workspaces/${workspaceId}/documents/${document.id}/edit`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    onDelete();
  };

  return (
    <div
      className="p-4 flex items-center gap-4 hover:bg-slate-700/50 cursor-pointer transition-colors"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div className="flex-shrink-0">
        {document.contentType === 'FILE' ? (
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-white font-medium truncate">{document.title}</h3>
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          {document.originalFilename && (
            <span className="truncate">{document.originalFilename}</span>
          )}
          {document.fileSize && (
            <span>{formatFileSize(document.fileSize)}</span>
          )}
          <span>{formatDate(document.createdAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {getStatusBadge(document.processingStatus)}
        {document.tags.length > 0 && (
          <div className="flex gap-1">
            {document.tags.slice(0, 2).map(({ tag }) => (
              <span key={tag.id} className="px-2 py-0.5 bg-slate-600 rounded text-xs text-slate-300">
                {tag.name}
              </span>
            ))}
            {document.tags.length > 2 && (
              <span className="text-slate-500 text-xs">+{document.tags.length - 2}</span>
            )}
          </div>
        )}
        <button
          onClick={handleDeleteClick}
          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
          title="Delete document"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function NewDocumentModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, content: string) => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    await onCreate(title, content);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">New Text Document</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Document title"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Enter document content (supports Markdown)"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
