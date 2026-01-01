import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createApiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/model/authStore';
import { toast } from '@/shared/ui';
import { useEditLock } from './hooks/useEditLock';
import { useAutoSave } from './hooks/useAutoSave';
import { useDocumentFieldChange } from './hooks/useDocumentFieldChange';
// LocalStorage backup removed - using server-side drafts only
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { LockStatusIndicator } from './LockStatusIndicator';
import { InlineEditor } from './InlineEditor';
import { TagInput } from './TagInput';
import { DocumentPurposeSelector } from './DocumentPurposeSelector';
import { DraftBadge } from './DraftBadge';
import { PublishConfirmationDialog } from './PublishConfirmationDialog';
import { DiscardDraftConfirmationDialog } from './DiscardDraftConfirmationDialog';
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
  // Draft fields
  draftTitle: string | null;
  draftContent: string | null;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
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

  // Use ref to always have the latest expectedUpdatedAt value
  // This prevents stale closure issues when auto-save is queued with old expectedUpdatedAt
  const expectedUpdatedAtRef = useRef<string | null>(null);

  // Track if user has made changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Draft/Publish dialog states
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Loading states
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

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

  // Helper to update expectedUpdatedAt in both ref and state
  // Ref ensures we always have the latest value even in closures
  const updateExpectedUpdatedAt = useCallback((value: string) => {
    expectedUpdatedAtRef.current = value;
  }, []);

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
    onLockAcquired: (updatedAt) => {
      // Update expectedUpdatedAt with the new value from lock acquisition
      // This prevents 409 CONFLICT on first save after lock is acquired
      updateExpectedUpdatedAt(updatedAt);
    },
    onHeartbeat: (updatedAt) => {
      // Update expectedUpdatedAt after each heartbeat
      // Heartbeat updates document.updatedAt on server, so we need to sync
      updateExpectedUpdatedAt(updatedAt);
    },
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
    cancelPendingSave,
  } = useAutoSave({
    workspaceId: workspaceId!,
    documentId: documentId!,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiClient: apiClient as any,
    endpoint: 'save-draft', // Use save-draft endpoint for draft/publish workflow
    // Pass ref so auto-save always uses the current expectedUpdatedAt value
    // This prevents 409 CONFLICT when rapid typing causes overlapping saves
    expectedUpdatedAtRef,
    onSaved: (updatedAt) => {
      updateExpectedUpdatedAt(updatedAt);
      setHasUnsavedChanges(false);
      // Update document state to reflect that we now have a draft
      setDocument((prev) => prev ? { ...prev, hasDraft: true } : prev);
    },
    onConflict: () => {
      toast.error('Document was modified by another user. Please refresh to see the latest version.');
    },
  });

  const isReadOnly = lockStatus === 'locked_by_other' || lockStatus === 'error';
  const isFileDocument = document?.contentType === 'FILE';
  const publishDisabled = isReadOnly || (!document?.hasDraft && !hasUnsavedChanges);
  const publishTitle = publishDisabled
    ? (isReadOnly ? 'Read-only' : 'No draft to publish')
    : 'Publish document';

  // Document field change hook for unified auto-save handling
  const handleFieldChange = useDocumentFieldChange({
    lockStatus,
    scheduleAutoSave,
    formData: { title, content, sourceDescription, verificationStatus, purpose, tags },
    lastKnownUpdatedAt: expectedUpdatedAtRef.current,
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

        // Use server data (draft if exists, otherwise published)
        setTitle(doc.draftTitle ?? doc.title);
        setContent(doc.draftContent ?? doc.content);

        setSourceDescription(doc.sourceDescription || '');
        setVerificationStatus(doc.verificationStatus);
        setPurpose(doc.purpose);
        setTags(doc.tags.map((t) => t.tag.name));
        updateExpectedUpdatedAt(doc.updatedAt);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, documentId]);

  // Draft/Publish handlers
  const handleSaveDraft = useCallback(async () => {
    await forceSave();
    toast.success('Draft saved');
  }, [forceSave]);

  const handlePublish = useCallback(async () => {
    if (hasUnsavedChanges) {
      const saved = await forceSave();
      if (!saved) {
        toast.error('Failed to save changes before publishing');
        return;
      }
    }

    setShowPublishDialog(true);
  }, [hasUnsavedChanges, forceSave]);

  const handlePublishConfirm = useCallback(async () => {
    // Cancel any pending auto-save to prevent race condition
    cancelPendingSave();
    setIsPublishing(true);
    try {
      const result = await apiClient.post(
        `workspaces/${workspaceId}/documents/${documentId}/publish`,
        { json: { expectedUpdatedAt: expectedUpdatedAtRef.current } }
      ).json<{ id: string; hasDraft: boolean; publishedAt: string; processingStatus: string; updatedAt: string }>();

      updateExpectedUpdatedAt(result.updatedAt);
      toast.success('Published successfully');
      await releaseLock();
      navigate(`/workspaces/${workspaceId}`);
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 409) {
        toast.error('Document was modified by another user');
      } else {
        toast.error('Failed to publish');
      }
    } finally {
      setIsPublishing(false);
      setShowPublishDialog(false);
    }
  }, [apiClient, workspaceId, documentId, updateExpectedUpdatedAt, releaseLock, navigate, cancelPendingSave]);

  const handleDiscardConfirm = useCallback(async () => {
    // Cancel any pending auto-save to prevent race condition
    cancelPendingSave();
    setIsDiscarding(true);
    try {
      const result = await apiClient.post(
        `workspaces/${workspaceId}/documents/${documentId}/discard-draft`,
        { json: { expectedUpdatedAt: expectedUpdatedAtRef.current } }
      ).json<{ id: string; hasDraft: boolean; title: string; content: string; updatedAt: string }>();

      setTitle(result.title);
      setContent(result.content);
      updateExpectedUpdatedAt(result.updatedAt);
      setHasUnsavedChanges(false);
      setDocument((prev) => prev ? { ...prev, hasDraft: false } : prev);
      toast.success('Draft discarded');
      await releaseLock();
      navigate(`/workspaces/${workspaceId}`);
    } catch (_error) {
      toast.error('Failed to discard draft');
    } finally {
      setIsDiscarding(false);
      setShowDiscardDialog(false);
    }
  }, [apiClient, workspaceId, documentId, updateExpectedUpdatedAt, releaseLock, navigate, cancelPendingSave]);

  const handleCancel = useCallback(async () => {
    if (hasUnsavedChanges && document?.hasDraft) {
      setShowDiscardDialog(true);
    } else if (hasUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
      if (!confirmed) return;
      await releaseLock();
      navigate(`/workspaces/${workspaceId}`);
    } else {
      await releaseLock();
      navigate(`/workspaces/${workspaceId}`);
    }
  }, [hasUnsavedChanges, document, releaseLock, navigate, workspaceId]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S - Save draft
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        handleSaveDraft();
      }

      // Ctrl+Shift+P / Cmd+Shift+P - Publish
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        void handlePublish();
      }

      // Escape - Cancel (with confirmation if unsaved)
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveDraft, handlePublish, handleCancel]);

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
          onClick={handleCancel}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Documents
        </button>

        <div className="flex items-center gap-4">
          {document && (
            <DraftBadge
              status={
                hasUnsavedChanges
                  ? 'unsaved'
                  : document.hasDraft
                  ? 'draft'
                  : 'published'
              }
            />
          )}
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            aria-label="Cancel and return to document list"
          >
            Cancel
          </button>
          {document?.hasDraft && (
            <button
              onClick={() => setShowDiscardDialog(true)}
              disabled={isReadOnly || isDiscarding}
              className="px-4 py-2 border border-red-600 rounded-lg text-red-400 hover:text-red-300 hover:border-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Discard draft and revert to published version"
            >
              Discard Draft
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveDraft}
            disabled={isReadOnly}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Save draft without publishing"
          >
            Save Draft
          </button>
          <button
            onClick={handlePublish}
            disabled={publishDisabled}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            aria-label="Publish document and make it searchable"
            title={publishTitle}
          >
            Publish
          </button>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="mt-6 text-xs text-slate-500 text-center">
        <span className="mr-4">Ctrl+S to save draft</span>
        <span className="mr-4">Ctrl+Shift+P to publish</span>
        <span>Esc to cancel</span>
      </div>

      {/* Dialogs */}
      <PublishConfirmationDialog
        isOpen={showPublishDialog}
        onConfirm={handlePublishConfirm}
        onCancel={() => setShowPublishDialog(false)}
        isPublishing={isPublishing}
      />

      <DiscardDraftConfirmationDialog
        isOpen={showDiscardDialog}
        onConfirm={handleDiscardConfirm}
        onCancel={() => setShowDiscardDialog(false)}
        onSaveDraft={async () => {
          setShowDiscardDialog(false);
          await handleSaveDraft();
        }}
        isDiscarding={isDiscarding}
      />

    </div>
  );
}
