interface EditorHeaderProps {
  instructionSetName: string;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isLoadingPreview: boolean;
  selectedDocumentsCount: number;
  canSave: boolean;
  onBack: () => void;
  onSave: () => void;
  onPreview: () => void;
}

export function EditorHeader({
  instructionSetName,
  hasUnsavedChanges,
  isSaving,
  isLoadingPreview,
  selectedDocumentsCount,
  canSave,
  onBack,
  onSave,
  onPreview,
}: EditorHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div className="flex items-center gap-4 min-w-0">
        <button
          onClick={onBack}
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
          <span className="hidden sm:inline">Edit: {instructionSetName}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {hasUnsavedChanges && (
          <span className="text-xs sm:text-sm text-yellow-400">
            <span className="sm:hidden">●</span>
            <span className="hidden sm:inline">Unsaved changes</span>
          </span>
        )}
        <button
          onClick={onPreview}
          disabled={isLoadingPreview || selectedDocumentsCount === 0}
          className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
          aria-label="Preview content"
        >
          {isLoadingPreview ? (
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
          onClick={onSave}
          disabled={isSaving || !canSave}
          className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
        >
          {isSaving ? (
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
  );
}
