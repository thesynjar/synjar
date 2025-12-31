import { VerificationStatus } from '../types';

const VERIFICATION_BADGES: Record<VerificationStatus, { label: string; className: string; ariaLabel: string; title: string }> = {
  VERIFIED: {
    label: 'Verified',
    className: 'bg-green-500/20 text-green-400',
    ariaLabel: 'Trusted - used in Search and Instruction Sets',
    title: 'Trusted - used in Search/Sets',
  },
  UNVERIFIED: {
    label: 'Unverified',
    className: 'bg-amber-500/20 text-amber-400',
    ariaLabel: 'Not used in Search and Instruction Sets by default, can be included in Search',
    title: 'Not used in Search/Sets by default (can be included in Search)',
  },
};

interface VerificationBadgeProps {
  status: VerificationStatus;
}

export function VerificationBadge({ status }: VerificationBadgeProps) {
  const badge = VERIFICATION_BADGES[status];

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
