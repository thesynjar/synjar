import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TokenMeter } from './TokenMeter';
import { AvailableDocumentsList } from './AvailableDocumentsList';
import { SelectedDocumentsList } from './SelectedDocumentsList';
import { SetSettingsPanel } from './SetSettingsPanel';
import { ContentPreviewModal } from './ContentPreviewModal';
import { ConflictModal } from './ConflictModal';
import {
  useInstructionSetEditor,
  useDocumentOperations,
  useSetForm,
  useUnsavedChanges,
  useKeyboardShortcuts,
  useContentPreview,
  MAX_SIZE_BYTES,
  MAX_DOCUMENTS,
} from './hooks';
import { toast } from '@/shared/ui';
import { useWorkspaceMember } from '@/features/workspaces/hooks';

type MobileTab = 'available' | 'selected';

export function InstructionSetEditorPage() {
  const { workspaceId, setId } = useParams<{ workspaceId: string; setId: string }>();
  const navigate = useNavigate();

  // RBAC check for editing permissions
  const { canEdit, isLoading: memberLoading, error: memberError } = useWorkspaceMember({ workspaceId });

  // Search/filter state (kept local as it's UI-only state)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPurpose, setFilterPurpose] = useState<'ALL' | 'KNOWLEDGE' | 'INSTRUCTION'>('ALL');

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<MobileTab>('available');

  // Settings panel collapsed state (mobile)
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Data fetching and state management
  const editorData = useInstructionSetEditor({ workspaceId, setId });

  // Form state and save handler
  const formOps = useSetForm({
    workspaceId,
    setId,
    apiClient: editorData.apiClient,
    instructionSet: editorData.instructionSet,
    lastKnownUpdatedAt: editorData.lastKnownUpdatedAt,
    setInstructionSet: editorData.setInstructionSet,
    setLastKnownUpdatedAt: editorData.setLastKnownUpdatedAt,
  });

  // Document operations (add, remove, reorder)
  const docOps = useDocumentOperations({
    workspaceId,
    setId,
    apiClient: editorData.apiClient,
    availableDocuments: editorData.availableDocuments,
    selectedDocuments: editorData.selectedDocuments,
    totalSizeBytes: editorData.totalSizeBytes,
    instructionSet: editorData.instructionSet,
    setSelectedDocuments: editorData.setSelectedDocuments,
    setHasUnsavedChanges: formOps.setHasUnsavedChanges,
  });

  // Content preview
  const preview = useContentPreview({
    setId,
    isPublic: formOps.isPublic,
    apiClient: editorData.apiClient,
  });

  // Unsaved changes navigation warning
  const navigation = useUnsavedChanges({
    workspaceId,
    hasUnsavedChanges: formOps.hasUnsavedChanges,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave: formOps.handleSave,
    onBack: navigation.handleBack,
  });

  // Handle preview button click
  const handlePreviewClick = async () => {
    if (!formOps.isPublic) {
      toast.warning('Make the instruction set public to preview content');
      return;
    }
    await preview.fetchPreview();
  };

  // Handle conflict refresh
  const handleConflictRefresh = () => {
    window.location.reload();
  };

  if (editorData.isLoading || memberLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  // RBAC check - only OWNER and ADMIN can edit instruction sets
  if (!canEdit) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg text-yellow-400">
          {memberError
            ? 'Failed to verify your permissions. Please try again.'
            : "You don't have permission to edit instruction sets. Only workspace owners and admins can edit."}
        </div>
        <button
          onClick={() => navigate(`/workspaces/${workspaceId}?tab=instruction-sets`)}
          className="mt-4 text-blue-400 hover:underline"
        >
          Back to instruction sets
        </button>
      </div>
    );
  }

  if (editorData.loadError || !editorData.instructionSet) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
          {editorData.loadError || 'Instruction set not found'}
        </div>
        <button
          onClick={() => navigate(`/workspaces/${workspaceId}?tab=instruction-sets`)}
          className="mt-4 text-blue-400 hover:underline"
        >
          Back to instruction sets
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4">
      {/* Header - Responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={navigation.handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors shrink-0"
            aria-label="Back to workspace"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden sm:inline">Back to Workspace</span>
          </button>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <h1 className="text-lg sm:text-xl font-semibold text-white truncate">
            <span className="sm:hidden">Edit</span>
            <span className="hidden sm:inline">Edit: {editorData.instructionSet.name}</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {formOps.hasUnsavedChanges && (
            <span className="text-xs sm:text-sm text-yellow-400 hidden sm:inline">Unsaved changes</span>
          )}
          <button
            onClick={handlePreviewClick}
            disabled={preview.isLoadingPreview || editorData.selectedDocuments.length === 0}
            className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
            aria-label="Preview content"
          >
            {preview.isLoadingPreview ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button
            onClick={formOps.handleSave}
            disabled={formOps.isSaving || !formOps.name.trim()}
            className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
          >
            {formOps.isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span className="hidden sm:inline">Saving...</span>
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>

      {/* Token Meter - Sticky on mobile */}
      <div className="md:hidden sticky top-0 z-10 bg-slate-900 -mx-4 px-4 py-2 mb-4 border-b border-slate-700">
        <TokenMeter
          currentBytes={editorData.totalSizeBytes}
          maxBytes={MAX_SIZE_BYTES}
        />
      </div>

      {/* Mobile Tabs */}
      <div className="md:hidden mb-4">
        <div className="flex bg-slate-800 rounded-lg p-1" role="tablist">
          <button
            role="tab"
            aria-selected={mobileTab === 'available'}
            onClick={() => setMobileTab('available')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mobileTab === 'available'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Available
          </button>
          <button
            role="tab"
            aria-selected={mobileTab === 'selected'}
            onClick={() => setMobileTab('selected')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mobileTab === 'selected'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Selected ({editorData.selectedDocuments.length})
          </button>
        </div>
      </div>

      {/* Two-column layout (desktop) / Tabbed layout (mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-6">
        {/* Available Documents - Hidden on mobile when "selected" tab is active */}
        <div className={`min-h-80 ${mobileTab !== 'available' ? 'hidden md:block' : ''}`}>
          <AvailableDocumentsList
            documents={editorData.availableDocuments}
            selectedIds={editorData.selectedDocumentIds}
            searchQuery={searchQuery}
            filterPurpose={filterPurpose}
            onSearchChange={setSearchQuery}
            onFilterChange={setFilterPurpose}
            onAddDocument={docOps.handleAddDocument}
            maxDocuments={MAX_DOCUMENTS}
            currentDocumentCount={editorData.selectedDocuments.length}
            currentSize={editorData.totalSizeBytes}
            maxSize={MAX_SIZE_BYTES}
          />
        </div>

        {/* Selected Documents - Hidden on mobile when "available" tab is active */}
        <div className={`min-h-80 ${mobileTab !== 'selected' ? 'hidden md:block' : ''}`}>
          <SelectedDocumentsList
            documents={editorData.selectedDocuments}
            onRemove={docOps.handleRemoveDocument}
            onReorder={docOps.handleReorder}
          />
        </div>
      </div>

      {/* Token Meter - Desktop only (sticky version above for mobile) */}
      <div className="hidden md:block mb-6">
        <TokenMeter
          currentBytes={editorData.totalSizeBytes}
          maxBytes={MAX_SIZE_BYTES}
        />
      </div>

      {/* Settings Panel - Collapsible on mobile */}
      <div className="md:hidden mb-4">
        <button
          onClick={() => setSettingsExpanded(!settingsExpanded)}
          className="w-full flex items-center justify-between p-4 bg-slate-800 rounded-lg border border-slate-700"
          aria-expanded={settingsExpanded}
        >
          <span className="text-white font-medium">Settings</span>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${settingsExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {settingsExpanded && (
          <div className="mt-2">
            <SetSettingsPanel
              name={formOps.name}
              description={formOps.description}
              isPublic={formOps.isPublic}
              publicUrl={editorData.instructionSet.publicUrl}
              onNameChange={formOps.handleNameChange}
              onDescriptionChange={formOps.handleDescriptionChange}
              onPublicChange={formOps.handlePublicChange}
              disabled={formOps.isSaving}
            />
          </div>
        )}
      </div>

      {/* Settings Panel - Desktop */}
      <div className="hidden md:block">
        <SetSettingsPanel
          name={formOps.name}
          description={formOps.description}
          isPublic={formOps.isPublic}
          publicUrl={editorData.instructionSet.publicUrl}
          onNameChange={formOps.handleNameChange}
          onDescriptionChange={formOps.handleDescriptionChange}
          onPublicChange={formOps.handlePublicChange}
          disabled={formOps.isSaving}
        />
      </div>

      {/* Keyboard shortcuts hint - Desktop only */}
      <div className="hidden sm:block mt-6 text-xs text-slate-500 text-center">
        <span className="mr-4">Ctrl+S to save</span>
        <span>Esc to go back</span>
      </div>

      {/* Content Preview Modal */}
      {preview.previewContent && (
        <ContentPreviewModal
          content={preview.previewContent.content}
          name={preview.previewContent.name}
          tokenEstimate={preview.previewContent.tokenEstimate}
          onClose={preview.clearPreview}
        />
      )}

      {/* Conflict Modal */}
      {formOps.conflictDetails && (
        <ConflictModal
          lastModifiedAt={formOps.conflictDetails.lastModifiedAt}
          onRefresh={handleConflictRefresh}
          onClose={formOps.clearConflict}
        />
      )}
    </div>
  );
}
