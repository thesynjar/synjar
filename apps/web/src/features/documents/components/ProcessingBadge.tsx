import { ProcessingStatus } from '../types';

const PROCESSING_BADGES: Record<ProcessingStatus, { label: string; className: string; ariaLabel: string; title: string }> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-yellow-500/20 text-yellow-400',
    ariaLabel: 'Queued for indexing',
    title: 'Queued for indexing',
  },
  PROCESSING: {
    label: 'Indexing',
    className: 'bg-blue-500/20 text-blue-400',
    ariaLabel: 'Indexing in progress',
    title: 'Indexing in progress',
  },
  COMPLETED: {
    label: 'Indexed',
    className: 'bg-green-500/20 text-green-400',
    ariaLabel: 'Ready for search',
    title: 'Ready for search',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-500/20 text-red-400',
    ariaLabel: 'Indexing failed - check details in editor',
    title: 'Indexing failed - check details in editor',
  },
};

interface ProcessingBadgeProps {
  status: ProcessingStatus;
}

export function ProcessingBadge({ status }: ProcessingBadgeProps) {
  const badge = PROCESSING_BADGES[status];

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}
      aria-label={badge.ariaLabel}
      title={badge.title}
    >
      {badge.label}
    </span>
  );
}
