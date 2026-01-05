import { useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from '@/shared/ui';

interface DocumentUploadModalProps {
  isUploading: boolean;
  onClose: () => void;
  onUpload: (file: File, isVerified: boolean) => void;
}

export function DocumentUploadModal({ isUploading, onClose, onUpload }: DocumentUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isVerified, setIsVerified] = useState(true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUpload(file, isVerified);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      onUpload(file, isVerified);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Upload Documents</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close upload modal">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isVerified}
                onChange={(event) => setIsVerified(event.target.checked)}
                aria-describedby="upload-verification-hint"
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
              />
              <span className="text-sm text-slate-300">Mark as verified</span>
              <span
                id="upload-verification-hint"
                className="text-slate-500 cursor-help"
                title="Verified documents are used in Search and Instruction Sets by default. Leave unchecked if the document needs review."
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </label>
          </div>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-slate-500 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileSelect}
              className="hidden"
            />
            {isUploading ? (
              <div className="flex items-center justify-center gap-3">
                <LoadingSpinner size="sm" />
                <span className="text-slate-400">Uploading...</span>
              </div>
            ) : (
              <>
                <svg className="mx-auto h-10 w-10 text-slate-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-slate-400 mb-2">
                  Drag & drop files here, or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    browse
                  </button>
                </p>
                <p className="text-slate-500 text-sm">PDF, DOCX, TXT, MD up to 100MB</p>
              </>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
