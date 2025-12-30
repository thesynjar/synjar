import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TokenMeter } from './TokenMeter';
import { AvailableDocumentsList } from './AvailableDocumentsList';
import { SelectedDocumentsList } from './SelectedDocumentsList';
import { SetSettingsPanel } from './SetSettingsPanel';
import {
  useInstructionSetEditor,
  useDocumentOperations,
  useSetForm,
  useUnsavedChanges,
  useKeyboardShortcuts,
  MAX_SIZE_BYTES,
  MAX_DOCUMENTS,
} from './hooks';

export function InstructionSetEditorPage() {
  const { workspaceId, setId } = useParams<{ workspaceId: string; setId: string }>();
  const navigate = useNavigate();

  // Search/filter state (kept local as it's UI-only state)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPurpose, setFilterPurpose] = useState<'ALL' | 'KNOWLEDGE' | 'INSTRUCTION'>('ALL');

  // Data fetching and state management
  const editorData = useInstructionSetEditor({ workspaceId, setId });

  // Form state and save handler
  const formOps = useSetForm({
    setId,
    apiClient: editorData.apiClient,
    instructionSet: editorData.instructionSet,
    lastKnownUpdatedAt: editorData.lastKnownUpdatedAt,
    setInstructionSet: editorData.setInstructionSet,
    setLastKnownUpdatedAt: editorData.setLastKnownUpdatedAt,
  });

  // Document operations (add, remove, reorder)
  const docOps = useDocumentOperations({
    setId,
    apiClient: editorData.apiClient,
    availableDocuments: editorData.availableDocuments,
    selectedDocuments: editorData.selectedDocuments,
    totalSizeBytes: editorData.totalSizeBytes,
    instructionSet: editorData.instructionSet,
    setSelectedDocuments: editorData.setSelectedDocuments,
    setSaveError: formOps.setSaveError,
    setHasUnsavedChanges: formOps.setHasUnsavedChanges,
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

  if (editorData.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={navigation.handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Workspace
          </button>
          <span className="text-slate-600">|</span>
          <h1 className="text-xl font-semibold text-white">
            Edit: {editorData.instructionSet.name}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {formOps.hasUnsavedChanges && (
            <span className="text-sm text-yellow-400">Unsaved changes</span>
          )}
          <button
            onClick={formOps.handleSave}
            disabled={formOps.isSaving || !formOps.name.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {formOps.isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {formOps.saveError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 flex items-center justify-between">
          <span>{formOps.saveError}</span>
          <button
            onClick={() => formOps.setSaveError(null)}
            className="text-red-400 hover:text-red-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Available Documents */}
        <div className="min-h-[400px]">
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

        {/* Selected Documents */}
        <div className="min-h-[400px]">
          <SelectedDocumentsList
            documents={editorData.selectedDocuments}
            onRemove={docOps.handleRemoveDocument}
            onReorder={docOps.handleReorder}
          />
        </div>
      </div>

      {/* Token Meter */}
      <TokenMeter
        currentBytes={editorData.totalSizeBytes}
        maxBytes={MAX_SIZE_BYTES}
        className="mb-6"
      />

      {/* Settings Panel */}
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

      {/* Keyboard shortcuts hint */}
      <div className="mt-6 text-xs text-slate-500 text-center">
        <span className="mr-4">Ctrl+S to save</span>
        <span>Esc to go back</span>
      </div>
    </div>
  );
}
