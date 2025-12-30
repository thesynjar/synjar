import { useRef, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';

interface ConflictModalProps {
  lastModifiedAt: string;
  onRefresh: () => void;
  onClose: () => void;
}

export function ConflictModal({
  lastModifiedAt,
  onRefresh,
  onClose,
}: ConflictModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formattedDate = new Date(lastModifiedAt).toLocaleString();

  return (
    <FocusTrap>
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        aria-describedby="conflict-description"
      >
        <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-yellow-500/20 rounded-full">
              <svg
                className="h-6 w-6 text-yellow-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h2 id="conflict-title" className="text-lg font-semibold text-white mb-2">
                Changes Conflict
              </h2>
              <p id="conflict-description" className="text-slate-400 text-sm mb-4">
                This instruction set was modified by another user at {formattedDate}.
                Your changes cannot be saved without losing their updates.
              </p>
              <p className="text-slate-500 text-sm mb-6">
                Refresh the page to see the latest version. Your unsaved changes will be lost.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={onRefresh}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
                >
                  Refresh Page
                </button>
                <button
                  ref={closeButtonRef}
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
