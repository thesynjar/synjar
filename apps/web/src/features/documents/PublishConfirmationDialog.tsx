import FocusTrap from 'focus-trap-react';

interface PublishConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isPublishing: boolean;
}

export function PublishConfirmationDialog({
  isOpen,
  onConfirm,
  onCancel,
  isPublishing,
}: PublishConfirmationDialogProps) {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <FocusTrap>
        <div
          className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="publish-dialog-title"
          aria-describedby="publish-dialog-description"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 id="publish-dialog-title" className="text-lg font-semibold text-white mb-2">
                Publish document?
              </h2>
              <div id="publish-dialog-description" className="text-slate-400 text-sm space-y-1">
                <p>After publishing:</p>
                <ul className="list-disc list-inside ml-2">
                  <li>Document will be processed (embeddings)</li>
                  <li>Will be visible in RAG search</li>
                  <li>InstructionSets will show new version</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={isPublishing}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Cancel publishing"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isPublishing}
              autoFocus
              className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              aria-label="Confirm and publish document"
            >
              {isPublishing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Publishing...
                </>
              ) : (
                'Publish'
              )}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
