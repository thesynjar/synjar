import { LockStatus } from './hooks/useEditLock';

interface LockStatusIndicatorProps {
  status: LockStatus;
  lockedBy?: string;
  lockedUntil?: string;
}

export function LockStatusIndicator({ status, lockedBy, lockedUntil }: LockStatusIndicatorProps) {
  if (status === 'unlocked') {
    return null;
  }

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const statusConfig = {
    acquiring: {
      text: 'Acquiring lock...',
      className: 'text-slate-400',
      icon: (
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ),
    },
    locked_by_me: {
      text: 'You are editing',
      className: 'text-green-400',
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    locked_by_other: {
      text: `Locked by ${lockedBy || 'another user'}${lockedUntil ? ` until ${formatTime(lockedUntil)}` : ''}`,
      className: 'text-yellow-400',
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    error: {
      text: 'Lock error',
      className: 'text-red-400',
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  };

  const config = statusConfig[status];

  return (
    <div className={`flex items-center gap-2 text-sm ${config.className}`} aria-live="polite">
      {config.icon}
      <span>{config.text}</span>
    </div>
  );
}
