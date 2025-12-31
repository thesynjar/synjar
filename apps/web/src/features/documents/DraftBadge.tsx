interface DraftBadgeProps {
  status: 'draft' | 'published' | 'unsaved';
  className?: string;
}

export function DraftBadge({ status, className = '' }: DraftBadgeProps) {
  const variants = {
    draft: {
      bg: 'bg-yellow-500/20',
      text: 'text-yellow-400',
      label: 'Draft ●',
      ariaLabel: 'Document has unpublished draft',
    },
    published: {
      bg: 'bg-green-500/20',
      text: 'text-green-400',
      label: 'Published ✓',
      ariaLabel: 'Document is published',
    },
    unsaved: {
      bg: 'bg-orange-500/20',
      text: 'text-orange-400',
      label: 'Unsaved changes',
      ariaLabel: 'You have unsaved local changes',
    },
  };

  const variant = variants[status];

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${variant.bg} ${variant.text} ${className}`}
      role="status"
      aria-label={variant.ariaLabel}
    >
      {variant.label}
    </span>
  );
}
