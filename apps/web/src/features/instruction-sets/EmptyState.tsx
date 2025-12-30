interface EmptyStateProps {
  onCreateClick: () => void;
}

export function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mb-4">
        <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-white mb-2">No Instruction Sets Yet</h3>
      <p className="text-slate-400 max-w-md mx-auto mb-6">
        Create instruction sets to bundle documents for AI context. Share a single link with your team - everyone gets the same, always up-to-date instructions.
      </p>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-md mx-auto text-left mb-6">
        <h4 className="text-white font-medium mb-3">Use Cases</h4>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">1.</span>
            <span><strong className="text-slate-300">Brand Voice</strong> - Keep marketing content consistent</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">2.</span>
            <span><strong className="text-slate-300">Sales Playbook</strong> - Onboard new team members faster</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">3.</span>
            <span><strong className="text-slate-300">API Documentation</strong> - Let AI know your codebase</span>
          </li>
        </ul>
      </div>

      <button
        onClick={onCreateClick}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors inline-flex items-center gap-2"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create Your First Set
      </button>
    </div>
  );
}
