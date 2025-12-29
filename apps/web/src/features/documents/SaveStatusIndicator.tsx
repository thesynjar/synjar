import { SaveStatus } from './hooks/useAutoSave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  error?: string | null;
  onRetry?: () => void;
}

export function SaveStatusIndicator({ status, error, onRetry }: SaveStatusIndicatorProps) {
  if (status === 'idle') {
    return null;
  }

  const statusConfig = {
    saving: {
      text: 'Saving...',
      className: 'text-slate-400',
      icon: (
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ),
    },
    saved: {
      text: 'Saved',
      className: 'text-green-400',
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    error: {
      text: error || 'Error saving',
      className: 'text-red-400',
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    conflict: {
      text: 'Conflict detected',
      className: 'text-yellow-400',
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  };

  const config = statusConfig[status];

  return (
    <div className={`flex items-center gap-2 text-sm ${config.className}`} aria-live="polite">
      {config.icon}
      <span>{config.text}</span>
      {(status === 'error' || status === 'conflict') && onRetry && (
        <button
          onClick={onRetry}
          className="ml-2 underline hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
