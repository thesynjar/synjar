interface TagPillProps {
  name: string;
  onRemove?: () => void;
  count?: number;
}

export function TagPill({ name, onRemove, count }: TagPillProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-600 rounded text-xs text-slate-300">
      <span>{name}</span>
      {count !== undefined && (
        <span className="text-slate-400">({count})</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 text-slate-400 hover:text-red-400 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          aria-label={`Remove ${name} tag`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
