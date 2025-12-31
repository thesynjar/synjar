import { DocumentPurpose } from '@/shared/types/document.types';

const PURPOSE_BADGES: Record<DocumentPurpose, { label: string; className: string; ariaLabel: string; title: string }> = {
  KNOWLEDGE: {
    label: 'Knowledge',
    className: 'bg-blue-500/20 text-blue-400',
    ariaLabel: 'Knowledge document - indexed for search and available in instruction sets',
    title: 'Knowledge - indexed for search and available in Instruction Sets',
  },
  INSTRUCTION: {
    label: 'Instruction',
    className: 'bg-purple-500/20 text-purple-400',
    ariaLabel: 'Instruction document - full context only, not indexed for search',
    title: 'Instruction - full context only, not indexed for search',
  },
};

interface DocumentPurposeBadgeProps {
  purpose: DocumentPurpose;
}

export function DocumentPurposeBadge({ purpose }: DocumentPurposeBadgeProps) {
  const badge = PURPOSE_BADGES[purpose];

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
