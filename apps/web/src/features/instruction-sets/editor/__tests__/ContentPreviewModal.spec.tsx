import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContentPreviewModal } from '../ContentPreviewModal';

// Mock focus-trap-react to avoid focus trap issues in tests
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock toast
vi.mock('@/shared/ui', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('ContentPreviewModal', () => {
  const defaultProps = {
    content: 'Test document content\n---\nSecond document',
    name: 'Test Document',
    tokenEstimate: 1250,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset clipboard mock
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('content display', () => {
    it('should display the document content', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      expect(screen.getByText(/Test document content/)).toBeInTheDocument();
    });

    it('should display the document name in header', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      expect(screen.getByText('Preview: Test Document')).toBeInTheDocument();
    });

    it('should display token estimate formatted with locale separators', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      expect(screen.getByText(/~1,250 tokens/)).toBeInTheDocument();
    });
  });

  describe('close button', () => {
    it('should call onClose when close button in header clicked', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      const closeButton = screen.getByLabelText('Close preview');
      fireEvent.click(closeButton);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when footer Close button clicked', () => {
      const onClose = vi.fn();
      render(<ContentPreviewModal {...defaultProps} onClose={onClose} />);
      const closeButton = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('copy functionality', () => {
    it('should copy content to clipboard when Copy All Content button clicked', async () => {
      render(<ContentPreviewModal {...defaultProps} />);
      const copyButton = screen.getByRole('button', { name: /Copy All Content/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          defaultProps.content
        );
      });
    });

    it('should show "Copied!" text after successful copy', async () => {
      render(<ContentPreviewModal {...defaultProps} />);
      const copyButton = screen.getByRole('button', { name: /Copy All Content/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Copied!/i })).toBeInTheDocument();
      });
    });

    it('should show error toast when copy fails', async () => {
      const { toast } = await import('@/shared/ui');
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Copy failed')) },
      });

      render(<ContentPreviewModal {...defaultProps} />);
      const copyButton = screen.getByRole('button', { name: /Copy All Content/i });
      fireEvent.click(copyButton);

      // Wait for the async error handler to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to copy to clipboard. Please try again.'
      );
    });
  });

  describe('keyboard interaction', () => {
    it('should call onClose when Escape key is pressed', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('backdrop interaction', () => {
    it('should call onClose when backdrop is clicked', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when modal content is clicked', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      const header = screen.getByText('Preview: Test Document');
      fireEvent.click(header);
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have dialog role', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have aria-modal attribute set to true', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('should have aria-labelledby pointing to title', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'preview-title');
    });

    it('should have accessible title with correct id', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      const title = screen.getByRole('heading', { level: 2 });
      expect(title).toHaveAttribute('id', 'preview-title');
    });

    it('should have accessible close button in header', () => {
      render(<ContentPreviewModal {...defaultProps} />);
      expect(screen.getByLabelText('Close preview')).toBeInTheDocument();
    });
  });
});
