import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TokenMeter } from './TokenMeter';
import { AvailableDocumentsList } from './AvailableDocumentsList';
import { SelectedDocumentsList } from './SelectedDocumentsList';
import { SetSettingsPanel } from './SetSettingsPanel';
import { ContentPreviewModal } from './ContentPreviewModal';
import { ConflictModal } from './ConflictModal';
import { EditorHeader } from './EditorHeader';
import { MobileTabs, type MobileTab } from './MobileTabs';
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
import { DocumentPurpose } from '@/shared/types/document.types';

type DocumentPurposeFilter = 'ALL' | DocumentPurpose;

export function InstructionSetEditorPage() {
  const { workspaceId, setId } = useParams<{ workspaceId: string; setId: string }>();
  const navigate = useNavigate();

  // RBAC check for editing permissions
  const { canEdit, isLoading: memberLoading, error: memberError } = useWorkspaceMember({ workspaceId });

  // Search/filter state (kept local as it's UI-only state)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPurpose, setFilterPurpose] = useState<DocumentPurposeFilter>('ALL');

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
    lastKnownUpdatedAt: editorData.lastKnownUpdatedAt,
    setSelectedDocuments: editorData.setSelectedDocuments,
    setHasUnsavedChanges: formOps.setHasUnsavedChanges,
    setLastKnownUpdatedAt: editorData.setLastKnownUpdatedAt,
  });

  // Content preview (client-side generation)
  const preview = useContentPreview({
    setId,
    formName: formOps.name,
    formDescription: formOps.description,
    selectedDocuments: editorData.selectedDocuments,
    availableDocuments: editorData.availableDocuments,
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

  // Handle preview button click (client-side, works for private sets too)
  const handlePreviewClick = () => {
    preview.generatePreview();
    if (preview.previewError) {
      toast.error(preview.previewError);
    }
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
      <EditorHeader
        instructionSetName={editorData.instructionSet.name}
        hasUnsavedChanges={formOps.hasUnsavedChanges}
        isSaving={formOps.isSaving}
        isLoadingPreview={preview.isLoadingPreview}
        selectedDocumentsCount={editorData.selectedDocuments.length}
        canSave={!!formOps.name.trim()}
        onBack={navigation.handleBack}
        onSave={formOps.handleSave}
        onPreview={handlePreviewClick}
      />

      {/* Token Meter - Sticky on mobile */}
      <div className="md:hidden sticky top-0 z-10 bg-slate-900 -mx-4 px-4 py-2 mb-4 border-b border-slate-700">
        <TokenMeter
          currentBytes={editorData.totalSizeBytes}
          maxBytes={MAX_SIZE_BYTES}
        />
      </div>

      {/* Mobile Tabs */}
      <MobileTabs
        activeTab={mobileTab}
        selectedCount={editorData.selectedDocuments.length}
        onTabChange={setMobileTab}
      />

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
