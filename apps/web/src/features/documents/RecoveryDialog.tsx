import FocusTrap from 'focus-trap-react';
import { DocumentBackup } from './hooks/useDocumentBackup';

interface RecoveryDialogProps {
  isOpen: boolean;
  localBackup: DocumentBackup;
  serverDraftUpdatedAt: Date | null;
  onUseLocal: () => void;
  onUseServer: () => void;
}

export function RecoveryDialog({
  isOpen,
  localBackup,
  serverDraftUpdatedAt,
  onUseLocal,
  onUseServer,
}: RecoveryDialogProps) {
  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <FocusTrap>
        <div
          className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="recovery-dialog-title"
          aria-describedby="recovery-dialog-description"
        >
          <div className="mb-4">
            <h2 id="recovery-dialog-title" className="text-lg font-semibold text-white mb-2">
              Local backup found
            </h2>
            <p id="recovery-dialog-description" className="text-slate-400 text-sm">
              You have a local backup that's newer than the server draft. Which version would you like to use?
            </p>
          </div>

          <div className="space-y-3 mb-6">
            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="text-sm text-slate-300 mb-1">Local Backup</div>
              <div className="text-xs text-slate-400">
                Saved: {formatDate(localBackup.savedAt)}
              </div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="text-sm text-slate-300 mb-1">Server Draft</div>
              <div className="text-xs text-slate-400">
                {serverDraftUpdatedAt
                  ? `Saved: ${formatDate(serverDraftUpdatedAt.toISOString())}`
                  : 'No server draft'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onUseServer}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              aria-label="Use server version"
            >
              Use Server
            </button>
            <button
              onClick={onUseLocal}
              autoFocus
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
              aria-label="Use local backup"
            >
              Use Local
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
