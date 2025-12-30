import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { useEditLock } from './hooks/useEditLock';
import { useAutoSave } from './hooks/useAutoSave';
import { useDocumentFieldChange } from './hooks/useDocumentFieldChange';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { LockStatusIndicator } from './LockStatusIndicator';
import { InlineEditor } from './InlineEditor';
import { TagInput } from './TagInput';
import { DocumentPurposeSelector } from './DocumentPurposeSelector';
import { DocumentPurpose, DEFAULT_DOCUMENT_PURPOSE } from '@/shared/types/document.types';

interface Document {
  id: string;
  title: string;
  content: string;
  contentType: 'TEXT' | 'FILE';
  originalFilename: string | null;
  sourceDescription: string | null;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
  processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  purpose: DocumentPurpose;
  tags: Array<{ tag: { id: string; name: string } }>;
  updatedAt: string;
}

export function DocumentEditPage() {
  const { workspaceId, documentId } = useParams<{ workspaceId: string; documentId: string }>();
  const navigate = useNavigate();
  const authStore = useAuthStore();

  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceDescription, setSourceDescription] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<'VERIFIED' | 'UNVERIFIED'>('UNVERIFIED');
  const [purpose, setPurpose] = useState<DocumentPurpose>(DEFAULT_DOCUMENT_PURPOSE);
  const [tags, setTags] = useState<string[]>([]);
  const [lastKnownUpdatedAt, setLastKnownUpdatedAt] = useState<string | null>(null);

  // Track if user has made changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // Edit lock hook
  const {
    lockStatus,
    lockInfo,
    error: lockError,
    releaseLock,
  } = useEditLock({
    workspaceId: workspaceId!,
    documentId: documentId!,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiClient: apiClient as any,
    onLockLost: () => {
      // Lock was lost - show warning and disable editing
      alert('Your edit lock has expired. Please refresh and try again.');
    },
  });

  // Auto-save hook
  const {
    saveStatus,
    error: saveError,
    scheduleAutoSave,
    forceSave,
  } = useAutoSave({
    workspaceId: workspaceId!,
    documentId: documentId!,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiClient: apiClient as any,
    onSaved: (updatedAt) => {
      setLastKnownUpdatedAt(updatedAt);
      setHasUnsavedChanges(false);
    },
    onConflict: () => {
      alert('This document was modified by another user. Please refresh to see the latest version.');
    },
  });

  const isReadOnly = lockStatus === 'locked_by_other' || lockStatus === 'error';
  const isFileDocument = document?.contentType === 'FILE';

  // Document field change hook for unified auto-save handling
  const handleFieldChange = useDocumentFieldChange({
    lockStatus,
    scheduleAutoSave,
    formData: { title, content, sourceDescription, verificationStatus, purpose, tags },
    lastKnownUpdatedAt,
    setHasUnsavedChanges,
  });

  // Fetch document on mount
  useEffect(() => {
    const fetchDocument = async () => {
      try {
        setIsLoading(true);
        const doc = await apiClient
          .get(`workspaces/${workspaceId}/documents/${documentId}`)
          .json<Document>();

        setDocument(doc);
        setTitle(doc.title);
        setContent(doc.content);
        setSourceDescription(doc.sourceDescription || '');
        setVerificationStatus(doc.verificationStatus);
        setPurpose(doc.purpose);
        setTags(doc.tags.map((t) => t.tag.name));
        setLastKnownUpdatedAt(doc.updatedAt);
      } catch (error) {
        console.error('Failed to fetch document:', error);
        setLoadError('Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    if (workspaceId && documentId) {
      fetchDocument();
    }
  }, [apiClient, workspaceId, documentId]);

  const handleBack = useCallback(async () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
      if (!confirmed) return;
    }

    await releaseLock();
    navigate(`/workspaces/${workspaceId}`);
  }, [hasUnsavedChanges, releaseLock, navigate, workspaceId]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S - Force save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        forceSave();
      }

      // Escape - Go back (with confirmation if unsaved)
      if (e.key === 'Escape') {
        handleBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [forceSave, handleBack]);

  const handleCloseAndIndex = useCallback(async () => {
    // Force save first
    await forceSave();

    // Trigger processing
    try {
      await apiClient.post(`workspaces/${workspaceId}/documents/${documentId}/process`);
    } catch (error) {
      console.error('Failed to trigger processing:', error);
    }

    await releaseLock();
    navigate(`/workspaces/${workspaceId}`);
  }, [apiClient, forceSave, releaseLock, navigate, workspaceId, documentId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (loadError || !document) {
    return (
      <div className="p-4">
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
          {loadError || 'Document not found'}
        </div>
        <Link to={`/workspaces/${workspaceId}`} className="mt-4 inline-block text-blue-400 hover:underline">
          Back to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Documents
        </button>

        <div className="flex items-center gap-4">
          <SaveStatusIndicator status={saveStatus} error={saveError} onRetry={forceSave} />
          <LockStatusIndicator
            status={lockStatus}
            lockedBy={lockInfo?.lockedBy}
            lockedUntil={lockInfo?.lockedUntil}
          />
        </div>
      </div>

      {/* Lock error message */}
      {lockError && lockStatus === 'locked_by_other' && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg text-yellow-400">
          {lockError}
        </div>
      )}

      {/* Title */}
      <div className="mb-6">
        <label htmlFor="title" className="block text-sm font-medium text-slate-400 mb-2">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => handleFieldChange('title', e.target.value, setTitle)}
          disabled={isReadOnly}
          maxLength={200}
          className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
          placeholder="Document title"
        />
      </div>

      {/* Content Editor */}
      <div className="mb-6">
        <label htmlFor="content" className="block text-sm font-medium text-slate-400 mb-2">
          Content {isFileDocument && <span className="text-slate-500">(Read-only for file documents)</span>}
        </label>
        <InlineEditor
          id="content"
          value={content}
          onChange={(value) => handleFieldChange('content', value, setContent)}
          readOnly={isReadOnly || isFileDocument}
          placeholder="Start typing your document..."
        />
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <label htmlFor="sourceDescription" className="block text-sm font-medium text-slate-400 mb-2">
            Source Description
          </label>
          <input
            id="sourceDescription"
            type="text"
            value={sourceDescription}
            onChange={(e) => handleFieldChange('sourceDescription', e.target.value, setSourceDescription)}
            disabled={isReadOnly}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
            placeholder="e.g., Email from client"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Verification Status</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="verificationStatus"
                checked={verificationStatus === 'UNVERIFIED'}
                onChange={() => handleFieldChange('verificationStatus', 'UNVERIFIED' as const, setVerificationStatus)}
                disabled={isReadOnly}
                className="text-blue-500"
              />
              <span className="text-slate-300">Unverified</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="verificationStatus"
                checked={verificationStatus === 'VERIFIED'}
                onChange={() => handleFieldChange('verificationStatus', 'VERIFIED' as const, setVerificationStatus)}
                disabled={isReadOnly}
                className="text-blue-500"
              />
              <span className="text-slate-300">Verified</span>
            </label>
          </div>
        </div>

        <div>
          <DocumentPurposeSelector
            value={purpose}
            onChange={(newPurpose) => handleFieldChange('purpose', newPurpose, setPurpose)}
            disabled={isReadOnly}
          />
        </div>
      </div>

      {/* Tags */}
      <div className="mb-6">
        <TagInput
          workspaceId={workspaceId!}
          selectedTags={tags}
          onTagsChange={(newTags) => handleFieldChange('tags', newTags, setTags)}
          disabled={isReadOnly}
          apiClient={apiClient}
        />
      </div>

      {/* Processing status */}
      {document.processingStatus === 'PENDING' && (
        <div className="mb-6 p-3 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-between">
          <span className="text-slate-400">This document is pending indexing</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        <button
          onClick={handleBack}
          className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCloseAndIndex}
          disabled={isReadOnly}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Close and Index
        </button>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="mt-6 text-xs text-slate-500 text-center">
        <span className="mr-4">Ctrl+S to save</span>
        <span>Esc to go back</span>
      </div>
    </div>
  );
}
