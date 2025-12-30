import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectedDocumentsList } from '../SelectedDocumentsList';

describe('SelectedDocumentsList', () => {
  const mockDocuments = [
    { id: '1', documentId: 'doc-1', title: 'First Doc', sizeBytes: 1000, order: 0 },
    { id: '2', documentId: 'doc-2', title: 'Second Doc', sizeBytes: 2000, order: 1 },
    { id: '3', documentId: 'doc-3', title: 'Third Doc', sizeBytes: 3000, order: 2 },
  ];

  describe('sorting logic', () => {
    it('should display documents sorted by order', () => {
      const unsorted = [
        { id: '2', documentId: 'doc-2', title: 'Second', sizeBytes: 1000, order: 1 },
        { id: '1', documentId: 'doc-1', title: 'First', sizeBytes: 1000, order: 0 },
      ];
      render(<SelectedDocumentsList documents={unsorted} onRemove={vi.fn()} onReorder={vi.fn()} />);

      const items = screen.getAllByRole('option');
      expect(items[0]).toHaveTextContent('First');
      expect(items[1]).toHaveTextContent('Second');
    });

    it('should maintain sort order when documents have different order values', () => {
      const documents = [
        { id: '3', documentId: 'doc-3', title: 'Third', sizeBytes: 1000, order: 2 },
        { id: '1', documentId: 'doc-1', title: 'First', sizeBytes: 1000, order: 0 },
        { id: '2', documentId: 'doc-2', title: 'Second', sizeBytes: 1000, order: 1 },
      ];
      render(<SelectedDocumentsList documents={documents} onRemove={vi.fn()} onReorder={vi.fn()} />);

      const items = screen.getAllByRole('option');
      expect(items[0]).toHaveTextContent('First');
      expect(items[1]).toHaveTextContent('Second');
      expect(items[2]).toHaveTextContent('Third');
    });
  });

  describe('remove handler', () => {
    it('should call onRemove with documentId when remove button clicked', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={onRemove} onReorder={vi.fn()} />);

      const removeButtons = screen.getAllByLabelText(/Remove .* from set/);
      await user.click(removeButtons[0]);

      expect(onRemove).toHaveBeenCalledWith('doc-1');
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('should call onRemove with correct documentId for each button', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={onRemove} onReorder={vi.fn()} />);

      const removeButtons = screen.getAllByLabelText(/Remove .* from set/);
      await user.click(removeButtons[1]);

      expect(onRemove).toHaveBeenCalledWith('doc-2');
    });
  });

  describe('empty state', () => {
    it('should show empty message when no documents', () => {
      render(<SelectedDocumentsList documents={[]} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByText(/No documents selected/)).toBeInTheDocument();
    });

    it('should show instruction text in empty state', () => {
      render(<SelectedDocumentsList documents={[]} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByText(/Add documents from the left panel/)).toBeInTheDocument();
    });

    it('should not render document list when empty', () => {
      render(<SelectedDocumentsList documents={[]} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have drag instructions for screen readers', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByText(/Use arrow keys to reorder/)).toBeInTheDocument();
    });

    it('should have proper position labels', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByLabelText(/position 1 of 3/)).toBeInTheDocument();
      expect(screen.getByLabelText(/position 2 of 3/)).toBeInTheDocument();
      expect(screen.getByLabelText(/position 3 of 3/)).toBeInTheDocument();
    });

    it('should have listbox role for document container', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      const listbox = screen.getByRole('listbox');
      expect(listbox).toHaveAttribute('aria-label', 'Selected documents in order');
    });

    it('should have option role for each document', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(3);
      options.forEach((option) => {
        expect(option).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('should include size in aria-label', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByLabelText(/First Doc.*1000 B/)).toBeInTheDocument();
    });
  });

  describe('document count display', () => {
    it('should show count in header', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByText('Selected Documents (3)')).toBeInTheDocument();
    });

    it('should update count when documents change', () => {
      const { rerender } = render(
        <SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />
      );
      expect(screen.getByText('Selected Documents (3)')).toBeInTheDocument();

      rerender(
        <SelectedDocumentsList
          documents={mockDocuments.slice(0, 1)}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
      );
      expect(screen.getByText('Selected Documents (1)')).toBeInTheDocument();
    });
  });

  describe('document display', () => {
    it('should display document titles', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByText('First Doc')).toBeInTheDocument();
      expect(screen.getByText('Second Doc')).toBeInTheDocument();
      expect(screen.getByText('Third Doc')).toBeInTheDocument();
    });

    it('should display document sizes formatted', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByText('1000 B')).toBeInTheDocument();
      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
      expect(screen.getByText('2.9 KB')).toBeInTheDocument();
    });

    it('should display position numbers', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      const positionBadges = screen.getAllByText(/^[123]$/);
      expect(positionBadges).toHaveLength(3);
    });

    it('should display purpose badge when present', () => {
      const documentsWithPurpose = [
        {
          id: '1',
          documentId: 'doc-1',
          title: 'Doc 1',
          sizeBytes: 1000,
          order: 0,
          purpose: 'KNOWLEDGE' as const,
        },
      ];
      render(
        <SelectedDocumentsList
          documents={documentsWithPurpose}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
      );
      expect(screen.getByText('KNOWLEDGE')).toBeInTheDocument();
    });
  });

  describe('drag handle', () => {
    it('should have drag handle buttons for all documents', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      const dragHandles = screen.getAllByLabelText(/Drag to reorder/);
      expect(dragHandles).toHaveLength(3);
    });

    it('should have descriptive aria-label for drag handles', () => {
      render(<SelectedDocumentsList documents={mockDocuments} onRemove={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByLabelText('Drag to reorder First Doc')).toBeInTheDocument();
      expect(screen.getByLabelText('Drag to reorder Second Doc')).toBeInTheDocument();
    });
  });
});
