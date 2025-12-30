interface AvailableDocument {
  id: string;
  title: string;
  sizeBytes: number;
  purpose: 'KNOWLEDGE' | 'INSTRUCTION';
}

interface AvailableDocumentsListProps {
  documents: AvailableDocument[];
  selectedIds: string[];
  searchQuery: string;
  filterPurpose: 'ALL' | 'KNOWLEDGE' | 'INSTRUCTION';
  onSearchChange: (query: string) => void;
  onFilterChange: (purpose: 'ALL' | 'KNOWLEDGE' | 'INSTRUCTION') => void;
  onAddDocument: (documentId: string) => void;
  maxDocuments: number;
  currentDocumentCount: number;
  currentSize: number;
  maxSize: number;
  isLoading?: boolean;
}

export function AvailableDocumentsList({
  documents,
  selectedIds,
  searchQuery,
  filterPurpose,
  onSearchChange,
  onFilterChange,
  onAddDocument,
  maxDocuments,
  currentDocumentCount,
  currentSize,
  maxSize,
  isLoading = false,
}: AvailableDocumentsListProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filter documents: exclude already selected, apply search and purpose filter
  const filteredDocuments = documents.filter((doc) => {
    // Exclude already selected
    if (selectedIds.includes(doc.id)) return false;

    // Apply search filter (case-insensitive)
    if (searchQuery && !doc.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Apply purpose filter
    if (filterPurpose !== 'ALL' && doc.purpose !== filterPurpose) {
      return false;
    }

    return true;
  });

  const canAddMore = currentDocumentCount < maxDocuments;

  const wouldExceedSize = (docSize: number) => {
    return currentSize + docSize > maxSize;
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 h-full">
        <h3 className="text-lg font-medium text-white mb-4">Available Documents</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 h-full flex flex-col">
      <h3 className="text-lg font-medium text-white mb-4">Available Documents</h3>

      {/* Search and Filter */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents..."
            aria-label="Search documents by title"
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <select
          value={filterPurpose}
          onChange={(e) => onFilterChange(e.target.value as 'ALL' | 'KNOWLEDGE' | 'INSTRUCTION')}
          aria-label="Filter documents by purpose"
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
        >
          <option value="ALL">All documents</option>
          <option value="KNOWLEDGE">Knowledge only</option>
          <option value="INSTRUCTION">Instructions only</option>
        </select>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredDocuments.length === 0 ? (
          <div className="text-center py-8">
            {searchQuery || filterPurpose !== 'ALL' ? (
              <>
                <svg
                  className="mx-auto h-12 w-12 text-slate-600 mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <p className="text-slate-400 mb-2">No documents found</p>
                <p className="text-slate-500 text-sm">Try different keywords or clear the filter</p>
                <button
                  onClick={() => {
                    onSearchChange('');
                    onFilterChange('ALL');
                  }}
                  className="mt-3 text-blue-400 hover:text-blue-300 text-sm"
                  aria-label="Clear search and show all documents"
                >
                  Clear search
                </button>
              </>
            ) : documents.length === 0 ? (
              <>
                <svg
                  className="mx-auto h-12 w-12 text-slate-600 mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                <p className="text-slate-400 mb-2">No documents available</p>
                <p className="text-slate-500 text-sm">
                  Upload documents to your workspace first, then add them to this instruction set.
                </p>
              </>
            ) : (
              <>
                <svg
                  className="mx-auto h-12 w-12 text-slate-600 mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <p className="text-slate-400">All documents have been added</p>
              </>
            )}
          </div>
        ) : (
          filteredDocuments.map((doc) => {
            const exceedsSize = wouldExceedSize(doc.sizeBytes);
            const isDisabled = !canAddMore || exceedsSize;

            return (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-slate-500 text-sm">{formatSize(doc.sizeBytes)}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        doc.purpose === 'INSTRUCTION'
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {doc.purpose}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onAddDocument(doc.id)}
                  disabled={isDisabled}
                  className="ml-3 p-2 text-slate-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                  title={
                    !canAddMore
                      ? `Maximum ${maxDocuments} documents reached`
                      : exceedsSize
                      ? 'Adding this document would exceed size limit'
                      : 'Add to set'
                  }
                  aria-label={`Add ${doc.title} to set`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
