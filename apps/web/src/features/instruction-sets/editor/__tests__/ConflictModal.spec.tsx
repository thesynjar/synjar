import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConflictModal } from '../ConflictModal';

// Mock focus-trap-react to avoid issues with focus management in tests
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ConflictModal', () => {
  const mockOnRefresh = vi.fn();
  const mockOnClose = vi.fn();
  const testDate = '2025-12-30T10:00:00Z';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('display', () => {
    it('should display conflict message with formatted date', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/was modified/i)).toBeInTheDocument();
      // Check that date is formatted (will vary by locale, so check for any date string)
      expect(screen.getByText(/2025/)).toBeInTheDocument();
    });

    it('should display title "Changes Conflict"', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Changes Conflict')).toBeInTheDocument();
    });

    it('should display warning about losing changes', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      expect(
        screen.getByText(/Your unsaved changes will be lost/)
      ).toBeInTheDocument();
    });
  });

  describe('refresh button', () => {
    it('should call onRefresh when Refresh button clicked', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
      expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    });

    it('should have "Refresh Page" text', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('button', { name: 'Refresh Page' })).toBeInTheDocument();
    });
  });

  describe('cancel button', () => {
    it('should call onClose when Cancel button clicked', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard interaction', () => {
    it('should call onClose when Escape key pressed', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      const dialog = screen.getByRole('alertdialog');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('backdrop click', () => {
    it('should call onClose when backdrop clicked', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      const backdrop = screen.getByRole('alertdialog');
      // Click on the backdrop itself, not a child element
      fireEvent.click(backdrop);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('should have role="alertdialog"', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('should have aria-modal="true"', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('should have aria-labelledby pointing to title', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'conflict-title');
      expect(screen.getByText('Changes Conflict')).toHaveAttribute('id', 'conflict-title');
    });

    it('should have aria-describedby pointing to description', () => {
      render(
        <ConflictModal
          lastModifiedAt={testDate}
          onRefresh={mockOnRefresh}
          onClose={mockOnClose}
        />
      );

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveAttribute('aria-describedby', 'conflict-description');
      expect(screen.getByText(/was modified/i)).toHaveAttribute('id', 'conflict-description');
    });
  });
});
