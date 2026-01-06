import { useSearchParams } from 'react-router-dom';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  total: number;
}

export function Pagination({ currentPage, totalPages, total }: PaginationProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  if (totalPages <= 1) {
    return null;
  }

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(newPage));
    setSearchParams(params);
  };

  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  return (
    <nav
      aria-label="pagination"
      className="flex items-center justify-between px-4 py-3 bg-slate-800 border-t border-slate-700 rounded-b-xl"
    >
      <div className="text-sm text-slate-400">
        {total} document{total !== 1 ? 's' : ''} total
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={!hasPreviousPage}
          aria-label="Previous page"
          className="px-3 py-1.5 text-sm font-medium text-slate-300 bg-slate-700 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-700 transition-colors"
        >
          Previous
        </button>

        <span className="px-3 py-1.5 text-sm text-slate-300">
          Page {currentPage} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={!hasNextPage}
          aria-label="Next page"
          className="px-3 py-1.5 text-sm font-medium text-slate-300 bg-slate-700 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-700 transition-colors"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
