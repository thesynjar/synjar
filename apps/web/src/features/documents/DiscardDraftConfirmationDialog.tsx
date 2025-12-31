import FocusTrap from 'focus-trap-react';

interface DiscardDraftConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSaveDraft: () => void;
  isDiscarding: boolean;
}

export function DiscardDraftConfirmationDialog({
  isOpen,
  onConfirm,
  onCancel,
  onSaveDraft,
  isDiscarding,
}: DiscardDraftConfirmationDialogProps) {
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
          aria-labelledby="discard-dialog-title"
          aria-describedby="discard-dialog-description"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 id="discard-dialog-title" className="text-lg font-semibold text-white mb-2">
                Discard draft?
              </h2>
              <p id="discard-dialog-description" className="text-slate-400 text-sm">
                You have an unsaved draft. If you discard it, you'll return to the last published version.
                This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={isDiscarding}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Continue editing"
            >
              Continue Editing
            </button>
            <button
              onClick={onSaveDraft}
              disabled={isDiscarding}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50"
              aria-label="Save draft before closing"
            >
              Save Draft
            </button>
            <button
              onClick={onConfirm}
              disabled={isDiscarding}
              autoFocus
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              aria-label="Discard draft and return to published version"
            >
              {isDiscarding ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Discarding...
                </>
              ) : (
                'Discard'
              )}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
