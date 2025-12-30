import { useState } from 'react';
import { InstructionSet } from './types';

interface InstructionSetCardProps {
  set: InstructionSet;
  onDelete: () => void;
  onTogglePublic: (isPublic: boolean) => void;
}

export function InstructionSetCard({ set, onDelete, onTogglePublic }: InstructionSetCardProps) {
  const [copied, setCopied] = useState(false);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleCopyLink = async () => {
    if (set.publicUrl) {
      await navigator.clipboard.writeText(set.publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-medium text-white">{set.name}</h3>
            {set.isPublic ? (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                Public
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-600 text-slate-400 rounded text-xs">
                Private
              </span>
            )}
          </div>
          {set.description && (
            <p className="text-slate-400 text-sm mt-1">{set.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
            <span>{set.documentCount} documents</span>
            <span>{formatSize(set.totalSizeBytes)}</span>
            <span>Created {formatDate(set.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Public */}
          <button
            onClick={() => onTogglePublic(!set.isPublic)}
            className={`p-2 rounded-lg transition-colors ${
              set.isPublic
                ? 'text-green-400 hover:bg-green-500/20'
                : 'text-slate-400 hover:bg-slate-700'
            }`}
            title={set.isPublic ? 'Make private' : 'Make public'}
          >
            {set.isPublic ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
          </button>

          {/* Copy Link (only if public) */}
          {set.isPublic && set.publicUrl && (
            <button
              onClick={handleCopyLink}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              title="Copy public link"
            >
              {copied ? (
                <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              )}
            </button>
          )}

          {/* Delete */}
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete instruction set"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Public URL display */}
      {set.isPublic && set.publicUrl && (
        <div className="mt-4 p-3 bg-slate-900 rounded-lg">
          <p className="text-xs text-slate-500 mb-1">Public URL</p>
          <code className="text-sm text-blue-400 break-all">{set.publicUrl}</code>
        </div>
      )}
    </div>
  );
}
