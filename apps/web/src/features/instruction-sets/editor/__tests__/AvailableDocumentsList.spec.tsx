import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvailableDocumentsList } from '../AvailableDocumentsList';

describe('AvailableDocumentsList', () => {
  const mockDocuments = [
    { id: '1', title: 'API Documentation', sizeBytes: 1000, purpose: 'KNOWLEDGE' as const, tags: [] },
    { id: '2', title: 'Setup Instructions', sizeBytes: 2000, purpose: 'INSTRUCTION' as const, tags: [] },
    { id: '3', title: 'FAQ Guide', sizeBytes: 3000, purpose: 'KNOWLEDGE' as const, tags: [] },
  ];

  const defaultPagination = {
    page: 1,
    limit: 20,
    total: 3,
    totalPages: 1,
  };

  const defaultProps = {
    documents: mockDocuments,
    selectedIds: [],
    searchQuery: '',
    filterPurpose: 'ALL' as const,
    pagination: defaultPagination,
    onSearchChange: vi.fn(),
    onFilterChange: vi.fn(),
    onPageChange: vi.fn(),
    onAddDocument: vi.fn(),
    maxDocuments: 20,
    currentDocumentCount: 0,
    currentSize: 0,
    maxSize: 102400,
  };

  // Note: Search filtering is now server-side, so these tests verify
  // that the component displays what the server returns
  describe('search (server-side)', () => {
    it('should show all documents when server returns all', () => {
      render(<AvailableDocumentsList {...defaultProps} />);
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
      expect(screen.getByText('Setup Instructions')).toBeInTheDocument();
      expect(screen.getByText('FAQ Guide')).toBeInTheDocument();
    });

    it('should show filtered documents when server returns filtered results', () => {
      // Simulate server returning only one document matching search
      const filteredDocs = [mockDocuments[0]];
      render(
        <AvailableDocumentsList
          {...defaultProps}
          documents={filteredDocs}
          searchQuery="API"
        />
      );
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
      expect(screen.queryByText('Setup Instructions')).not.toBeInTheDocument();
    });

    it('should call onSearchChange when user types in search', async () => {
      const user = userEvent.setup();
      const onSearchChange = vi.fn();
      render(<AvailableDocumentsList {...defaultProps} onSearchChange={onSearchChange} />);

      const searchInput = screen.getByPlaceholderText('Search all documents...');
      await user.type(searchInput, 'API');

      // Debounced callback - wait for it
      await waitFor(() => {
        expect(onSearchChange).toHaveBeenCalled();
      }, { timeout: 500 });
    });
  });

  describe('purpose filtering (client-side)', () => {
    it('should filter by KNOWLEDGE purpose', () => {
      render(<AvailableDocumentsList {...defaultProps} filterPurpose="KNOWLEDGE" />);
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
      expect(screen.getByText('FAQ Guide')).toBeInTheDocument();
      expect(screen.queryByText('Setup Instructions')).not.toBeInTheDocument();
    });

    it('should filter by INSTRUCTION purpose', () => {
      render(<AvailableDocumentsList {...defaultProps} filterPurpose="INSTRUCTION" />);
      expect(screen.getByText('Setup Instructions')).toBeInTheDocument();
      expect(screen.queryByText('API Documentation')).not.toBeInTheDocument();
      expect(screen.queryByText('FAQ Guide')).not.toBeInTheDocument();
    });

    it('should show all when purpose is ALL', () => {
      render(<AvailableDocumentsList {...defaultProps} filterPurpose="ALL" />);
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
      expect(screen.getByText('Setup Instructions')).toBeInTheDocument();
      expect(screen.getByText('FAQ Guide')).toBeInTheDocument();
    });
  });

  describe('selected documents exclusion', () => {
    it('should exclude selected documents from list', () => {
      render(<AvailableDocumentsList {...defaultProps} selectedIds={['1', '2']} />);
      expect(screen.queryByText('API Documentation')).not.toBeInTheDocument();
      expect(screen.queryByText('Setup Instructions')).not.toBeInTheDocument();
      expect(screen.getByText('FAQ Guide')).toBeInTheDocument();
    });
  });

  describe('add document', () => {
    it('should call onAddDocument when add button clicked', async () => {
      const user = userEvent.setup();
      const onAddDocument = vi.fn();
      render(<AvailableDocumentsList {...defaultProps} onAddDocument={onAddDocument} />);

      const addButtons = screen.getAllByLabelText(/Add .* to set/);
      await user.click(addButtons[0]);

      expect(onAddDocument).toHaveBeenCalledWith('1');
      expect(onAddDocument).toHaveBeenCalledTimes(1);
    });

    it('should disable add when max documents reached', () => {
      render(<AvailableDocumentsList {...defaultProps} currentDocumentCount={20} />);
      const addButtons = screen.getAllByRole('button', { name: /Add .* to set/ });
      addButtons.forEach((btn) => expect(btn).toBeDisabled());
    });

    it('should disable add when size limit would be exceeded', () => {
      render(<AvailableDocumentsList {...defaultProps} currentSize={102000} />);
      const addButton = screen.getByLabelText('Add API Documentation to set');
      expect(addButton).toBeDisabled();
    });

    it('should show tooltip when disabled due to max documents', () => {
      render(<AvailableDocumentsList {...defaultProps} currentDocumentCount={20} />);
      const addButton = screen.getAllByRole('button', { name: /Add .* to set/ })[0];
      expect(addButton).toHaveAttribute('title', 'Maximum 20 documents reached');
    });

    it('should show tooltip when disabled due to size limit', () => {
      render(<AvailableDocumentsList {...defaultProps} currentSize={102000} />);
      const addButton = screen.getByLabelText('Add API Documentation to set');
      expect(addButton).toHaveAttribute(
        'title',
        'Adding this document would exceed size limit'
      );
    });
  });

  describe('empty states', () => {
    it('should show "no results" when documents array is empty with active search/filter', () => {
      render(<AvailableDocumentsList {...defaultProps} documents={[]} searchQuery="xyz" />);
      expect(screen.getByText(/No documents found/)).toBeInTheDocument();
      expect(screen.getByText(/Try different keywords/)).toBeInTheDocument();
    });

    it('should show "no documents" when workspace has no documents', () => {
      render(<AvailableDocumentsList {...defaultProps} documents={[]} />);
      expect(screen.getByText(/No documents available/)).toBeInTheDocument();
      expect(screen.getByText(/Upload documents to your workspace/)).toBeInTheDocument();
    });

    it('should show "all added" when all docs are selected', () => {
      render(<AvailableDocumentsList {...defaultProps} selectedIds={['1', '2', '3']} />);
      expect(screen.getByText(/All documents have been added/)).toBeInTheDocument();
    });

    it('should show clear search button in no results state', () => {
      render(<AvailableDocumentsList {...defaultProps} documents={[]} searchQuery="xyz" />);
      const clearButton = screen.getByText('Clear search');
      expect(clearButton).toBeInTheDocument();
    });

    it('should clear search and filter when clear button clicked', async () => {
      const user = userEvent.setup();
      const onSearchChange = vi.fn();
      const onFilterChange = vi.fn();
      render(
        <AvailableDocumentsList
          {...defaultProps}
          documents={[]}
          searchQuery="xyz"
          filterPurpose="KNOWLEDGE"
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
        />
      );

      const clearButton = screen.getByText('Clear search');
      await user.click(clearButton);

      expect(onSearchChange).toHaveBeenCalledWith('');
      expect(onFilterChange).toHaveBeenCalledWith('ALL');
    });
  });

  describe('loading state', () => {
    it('should show skeleton loaders when isLoading is true', () => {
      render(<AvailableDocumentsList {...defaultProps} isLoading={true} />);
      expect(screen.getByText('Available Documents')).toBeInTheDocument();
      // Now using skeleton loaders with animate-pulse instead of spinner
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not show document list when loading', () => {
      render(<AvailableDocumentsList {...defaultProps} isLoading={true} />);
      expect(screen.queryByText('API Documentation')).not.toBeInTheDocument();
    });
  });

  describe('search input', () => {
    it('should have search type and proper aria-label', () => {
      render(<AvailableDocumentsList {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText('Search all documents...');
      expect(searchInput).toHaveAttribute('type', 'search');
      expect(searchInput).toHaveAttribute('aria-label', 'Search documents by title');
    });
  });

  describe('purpose filter select', () => {
    it('should call onFilterChange when selection changes', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<AvailableDocumentsList {...defaultProps} onFilterChange={onFilterChange} />);

      const select = screen.getByLabelText('Filter documents by purpose');
      await user.selectOptions(select, 'KNOWLEDGE');

      expect(onFilterChange).toHaveBeenCalledWith('KNOWLEDGE');
    });

    it('should have all filter options', () => {
      render(<AvailableDocumentsList {...defaultProps} />);
      const select = screen.getByLabelText('Filter documents by purpose');
      expect(select).toContainHTML('<option value="ALL">All documents</option>');
      expect(select).toContainHTML('<option value="KNOWLEDGE">Knowledge only</option>');
      expect(select).toContainHTML('<option value="INSTRUCTION">Instructions only</option>');
    });
  });

  describe('document display', () => {
    it('should display document titles', () => {
      render(<AvailableDocumentsList {...defaultProps} />);
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
      expect(screen.getByText('Setup Instructions')).toBeInTheDocument();
      expect(screen.getByText('FAQ Guide')).toBeInTheDocument();
    });

    it('should display document sizes formatted', () => {
      render(<AvailableDocumentsList {...defaultProps} />);
      expect(screen.getByText('1000 B')).toBeInTheDocument();
      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
      expect(screen.getByText('2.9 KB')).toBeInTheDocument();
    });

    it('should display purpose badges', () => {
      render(<AvailableDocumentsList {...defaultProps} />);
      const knowledgeBadges = screen.getAllByText('KNOWLEDGE');
      const instructionBadges = screen.getAllByText('INSTRUCTION');
      expect(knowledgeBadges).toHaveLength(2);
      expect(instructionBadges).toHaveLength(1);
    });

    it('should display tags on documents', () => {
      const docsWithTags = [
        {
          id: '1',
          title: 'Tagged Doc',
          sizeBytes: 1000,
          purpose: 'KNOWLEDGE' as const,
          tags: [
            { tag: { id: 't1', name: 'api' } },
            { tag: { id: 't2', name: 'v2' } },
          ],
        },
      ];
      render(<AvailableDocumentsList {...defaultProps} documents={docsWithTags} />);
      expect(screen.getByText('api')).toBeInTheDocument();
      expect(screen.getByText('v2')).toBeInTheDocument();
    });
  });

  describe('pagination', () => {
    it('should show pagination when totalPages > 1', () => {
      const paginationMultiPage = { page: 1, limit: 20, total: 50, totalPages: 3 };
      render(<AvailableDocumentsList {...defaultProps} pagination={paginationMultiPage} />);
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('should not show pagination when totalPages is 1', () => {
      render(<AvailableDocumentsList {...defaultProps} />);
      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });

    it('should disable Previous on first page', () => {
      const paginationMultiPage = { page: 1, limit: 20, total: 50, totalPages: 3 };
      render(<AvailableDocumentsList {...defaultProps} pagination={paginationMultiPage} />);
      expect(screen.getByText('Previous')).toBeDisabled();
      expect(screen.getByText('Next')).not.toBeDisabled();
    });

    it('should disable Next on last page', () => {
      const paginationLastPage = { page: 3, limit: 20, total: 50, totalPages: 3 };
      render(<AvailableDocumentsList {...defaultProps} pagination={paginationLastPage} />);
      expect(screen.getByText('Previous')).not.toBeDisabled();
      expect(screen.getByText('Next')).toBeDisabled();
    });

    it('should call onPageChange when clicking Next', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      const paginationMultiPage = { page: 1, limit: 20, total: 50, totalPages: 3 };
      render(
        <AvailableDocumentsList
          {...defaultProps}
          pagination={paginationMultiPage}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByText('Next'));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('should call onPageChange when clicking Previous', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      const paginationPage2 = { page: 2, limit: 20, total: 50, totalPages: 3 };
      render(
        <AvailableDocumentsList
          {...defaultProps}
          pagination={paginationPage2}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByText('Previous'));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('should display total count', () => {
      render(<AvailableDocumentsList {...defaultProps} />);
      expect(screen.getByText('3 total')).toBeInTheDocument();
    });
  });
});
