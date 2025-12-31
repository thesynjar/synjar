import { useNavigate } from 'react-router-dom';
import { DocumentListItem } from '../types';
import { ProcessingBadge } from './ProcessingBadge';
import { VerificationBadge } from './VerificationBadge';
import { DocumentPurposeBadge } from './DocumentPurposeBadge';
import { TagPill } from '../TagPill';

interface DocumentRowProps {
  document: DocumentListItem;
  workspaceId: string;
  onDelete: () => void;
}

export function DocumentRow({ document, workspaceId, onDelete }: DocumentRowProps) {
  const navigate = useNavigate();

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
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

  const metadataParts = [
    document.originalFilename || (document.contentType === 'TEXT' ? 'Text document' : null),
    document.fileSize ? formatFileSize(document.fileSize) : null,
    formatDate(document.createdAt),
  ].filter(Boolean) as string[];

  const handleClick = () => {
    navigate(`/workspaces/${workspaceId}/documents/${document.id}/edit`);
  };

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onDelete();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="p-4 flex items-start gap-4 hover:bg-slate-700/50 cursor-pointer transition-colors"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="flex-shrink-0 pt-1">
        {document.contentType === 'FILE' ? (
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-white font-medium truncate">{document.title}</h3>
            <div className="flex flex-wrap items-center gap-3 text-slate-500 text-sm">
              {metadataParts.map((part) => (
                <span key={part} className="truncate">
                  {part}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={handleDeleteClick}
            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
            title="Delete document"
            aria-label="Delete document"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <VerificationBadge status={document.verificationStatus} />
          <ProcessingBadge status={document.processingStatus} />
          {document.hasDraft && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400"
              aria-label="Document has unpublished draft"
              title="Document has unpublished draft"
            >
              Draft ●
            </span>
          )}
          <DocumentPurposeBadge purpose={document.purpose} />
          {document.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {document.tags.slice(0, 2).map(({ tag }) => (
                <TagPill key={tag.id} name={tag.name} />
              ))}
              {document.tags.length > 2 && (
                <span className="text-slate-500 text-xs">+{document.tags.length - 2}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
