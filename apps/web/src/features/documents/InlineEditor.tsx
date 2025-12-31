interface InlineEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  id?: string;
}

export function InlineEditor({
  value,
  onChange,
  placeholder = 'Start typing your document...',
  readOnly = false,
  minHeight = '400px',
  maxHeight = '100vh',
  id,
}: InlineEditorProps) {
  return (
    <div className="relative">
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`
          w-full px-4 py-3
          bg-slate-900 border border-slate-700 rounded-lg
          text-white placeholder-slate-500
          font-mono text-sm leading-relaxed
          focus:outline-none focus:border-blue-500
          transition-colors resize-y overflow-auto
          ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}
        `}
        style={{ minHeight, maxHeight }}
        aria-label="Document content"
      />
      {readOnly && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-slate-700 rounded text-xs text-slate-400">
          Read-only
        </div>
      )}
    </div>
  );
}
