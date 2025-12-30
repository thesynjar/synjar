import { useState, useRef, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import { sanitizeText } from '@/shared/utils';
import { toast } from '@/shared/ui';

interface ContentPreviewModalProps {
  content: string;
  name: string;
  tokenEstimate: number;
  onClose: () => void;
}

export function ContentPreviewModal({
  content,
  name,
  tokenEstimate,
  onClose,
}: ContentPreviewModalProps) {
  const [copied, setCopied] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy to clipboard. Please try again.');
    }
  };

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

  return (
    <FocusTrap>
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
      >
        <div className="bg-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col mx-4">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <div>
              <h2 id="preview-title" className="text-xl font-semibold text-white">
                Preview: {name}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                ~{tokenEstimate.toLocaleString()} tokens
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-2"
              aria-label="Close preview"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            <pre className="bg-slate-900 rounded-lg p-4 text-slate-300 text-sm font-mono whitespace-pre-wrap overflow-x-auto">
              {sanitizeText(content)}
            </pre>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t border-slate-700">
            <button
              onClick={handleCopy}
              className={`px-4 py-2 rounded-lg text-white transition-colors ${
                copied
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {copied ? 'Copied!' : 'Copy All Content'}
            </button>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
