interface EmptyStateProps {
  onCreateClick: () => void;
}

export function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-700 mb-6">
        <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-white mb-2">
        Enable AI-powered search
      </h2>
      <p className="text-slate-400 mb-8 max-w-md mx-auto">
        Allow AI chatbots (ChatGPT, Claude) to search your knowledge base via public link.
      </p>

      {/* Use cases */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-8 max-w-lg mx-auto text-left">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Perfect for:</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <svg className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <span className="text-white">Support team</span>
              <span className="text-slate-400"> — "Search our 200 FAQ docs"</span>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <svg className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <span className="text-white">Developers</span>
              <span className="text-slate-400"> — "RAG API for my chatbot"</span>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <svg className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <span className="text-white">Marketing</span>
              <span className="text-slate-400"> — "Time-limited product docs access"</span>
            </div>
          </li>
        </ul>
      </div>

      {/* Comparison box */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 mb-8 max-w-lg mx-auto text-left">
        <div className="flex items-center gap-2 mb-4">
          <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h3 className="text-sm font-medium text-slate-300">Not sure which to use?</h3>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-slate-400">
            <span className="text-white">Instruction Sets:</span> Load full docs (best for &lt;20 docs)
          </p>
          <p className="text-slate-400">
            <span className="text-white">Search Links:</span> Search on-demand (any size)
          </p>
        </div>
      </div>

      <button
        onClick={onCreateClick}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors cursor-pointer"
      >
        Create Search Link
      </button>
    </div>
  );
}
