import { useState, useEffect, useMemo, useCallback } from 'react';
import { DocumentPurpose } from '@/shared/types/document.types';
import { TagPill } from '@/features/documents/TagPill';

type DocumentPurposeFilter = 'ALL' | DocumentPurpose;

interface AvailableDocument {
  id: string;
  title: string;
  sizeBytes: number;
  purpose: DocumentPurpose;
  tags: Array<{ tag: { id: string; name: string } }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface AvailableDocumentsListProps {
  documents: AvailableDocument[];
  selectedIds: string[];
  searchQuery: string;
  filterPurpose: DocumentPurposeFilter;
  pagination: Pagination;
  onSearchChange: (query: string) => void;
  onFilterChange: (purpose: DocumentPurposeFilter) => void;
  onPageChange: (page: number) => void;
  onAddDocument: (documentId: string) => void;
  maxDocuments: number;
  currentDocumentCount: number;
  currentSize: number;
  maxSize: number;
  isLoading?: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;

export function AvailableDocumentsList({
  documents,
  selectedIds,
  searchQuery,
  filterPurpose,
  pagination,
  onSearchChange,
  onFilterChange,
  onPageChange,
  onAddDocument,
  maxDocuments,
  currentDocumentCount,
  currentSize,
  maxSize,
  isLoading = false,
}: AvailableDocumentsListProps) {
  // Local input state for immediate feedback
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  // Sync local state when external searchQuery changes
  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  // Debounced search - update parent after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearchQuery !== searchQuery) {
        onSearchChange(localSearchQuery);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [localSearchQuery, searchQuery, onSearchChange]);

  // Handle search input change
  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSearchQuery(e.target.value);
  }, []);

  // Clear search handler
  const handleClearSearch = useCallback(() => {
    setLocalSearchQuery('');
    onSearchChange('');
    onFilterChange('ALL');
  }, [onSearchChange, onFilterChange]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filter documents: exclude already selected, apply purpose filter (search is server-side)
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Exclude already selected
      if (selectedIds.includes(doc.id)) return false;

      // Apply purpose filter (client-side since API doesn't support it yet)
      if (filterPurpose !== 'ALL' && doc.purpose !== filterPurpose) {
        return false;
      }

      return true;
    });
  }, [documents, selectedIds, filterPurpose]);

  const canAddMore = currentDocumentCount < maxDocuments;

  const wouldExceedSize = useCallback((docSize: number) => {
    return currentSize + docSize > maxSize;
  }, [currentSize, maxSize]);

  const hasNextPage = pagination.page < pagination.totalPages;
  const hasPrevPage = pagination.page > 1;

  // Show spinner when typing (debounce pending) OR when loading from API
  const isSearching = (localSearchQuery !== searchQuery) || (isLoading && localSearchQuery !== '');

  if (isLoading) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 h-full">
        <h3 className="text-lg font-medium text-white mb-4">Available Documents</h3>
        {/* Skeleton loaders */}
        <div className="space-y-3 mb-4">
          {/* Search skeleton */}
          <div className="h-10 bg-slate-700 rounded-lg animate-pulse" />
          {/* Filter skeleton */}
          <div className="h-10 bg-slate-700 rounded-lg animate-pulse" />
        </div>
        {/* Document skeletons */}
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3 bg-slate-900 rounded-lg border border-slate-700">
              <div className="h-5 bg-slate-700 rounded w-3/4 animate-pulse mb-2" />
              <div className="flex items-center gap-2">
                <div className="h-4 bg-slate-700 rounded w-16 animate-pulse" />
                <div className="h-4 bg-slate-700 rounded w-20 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-white">Available Documents</h3>
        {pagination.total > 0 && (
          <span className="text-sm text-slate-400">
            {pagination.total} total
          </span>
        )}
      </div>

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
            value={localSearchQuery}
            onChange={handleSearchInputChange}
            placeholder="Search all documents..."
            maxLength={200}
            aria-label="Search documents by title"
            className="w-full pl-10 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {/* Loading spinner when searching (debounce pending or API loading) */}
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg
                className="animate-spin h-4 w-4 text-slate-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}
        </div>

        <select
          value={filterPurpose}
          onChange={(e) => onFilterChange(e.target.value as DocumentPurposeFilter)}
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
            {localSearchQuery || filterPurpose !== 'ALL' ? (
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
                  onClick={handleClearSearch}
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
                  <div className="flex flex-wrap items-center gap-2 mt-1">
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
                    {doc.tags.slice(0, 2).map(({ tag }) => (
                      <TagPill key={tag.id} name={tag.name} />
                    ))}
                    {doc.tags.length > 2 && (
                      <span className="text-slate-500 text-xs">+{doc.tags.length - 2}</span>
                    )}
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

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-700">
          <button
            onClick={() => onPageChange(pagination.page - 1)}
            disabled={!hasPrevPage}
            className="px-3 py-1.5 text-sm text-slate-300 bg-slate-700 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-700 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-slate-400">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => onPageChange(pagination.page + 1)}
            disabled={!hasNextPage}
            className="px-3 py-1.5 text-sm text-slate-300 bg-slate-700 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-700 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
