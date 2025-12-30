import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenMeter } from '../TokenMeter';

describe('TokenMeter', () => {
  const MAX_BYTES = 102400; // 100 KB

  describe('status states', () => {
    it('should show "ok" status when under 60%', () => {
      render(<TokenMeter currentBytes={50000} maxBytes={MAX_BYTES} />);
      expect(screen.getByText(/Fits in Claude\/GPT-4 context/)).toBeInTheDocument();
    });

    it('should show "warning" status between 60-80%', () => {
      render(<TokenMeter currentBytes={70000} maxBytes={MAX_BYTES} />);
      expect(screen.getByText(/Getting close to limit/)).toBeInTheDocument();
    });

    it('should show "near_limit" status between 80-95%', () => {
      render(<TokenMeter currentBytes={85000} maxBytes={MAX_BYTES} />);
      expect(screen.getByText(/Near context limit/)).toBeInTheDocument();
    });

    it('should show "exceeded" status over 95%', () => {
      render(<TokenMeter currentBytes={98000} maxBytes={MAX_BYTES} />);
      expect(screen.getByText(/Exceeds recommended size/)).toBeInTheDocument();
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens at 4 bytes per token', () => {
      render(<TokenMeter currentBytes={4000} maxBytes={MAX_BYTES} />);
      expect(screen.getByText(/~1,000 tokens/)).toBeInTheDocument();
    });

    it('should format token count with locale separators', () => {
      render(<TokenMeter currentBytes={16000} maxBytes={MAX_BYTES} />);
      expect(screen.getByText(/~4,000 tokens/)).toBeInTheDocument();
    });
  });

  describe('size display', () => {
    it('should display current and max KB values', () => {
      render(<TokenMeter currentBytes={50000} maxBytes={MAX_BYTES} />);
      expect(screen.getByText(/48.8 KB \/ 100 KB/)).toBeInTheDocument();
    });

    it('should round max KB to integer', () => {
      render(<TokenMeter currentBytes={1024} maxBytes={MAX_BYTES} />);
      expect(screen.getByText(/100 KB/)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes for meter', () => {
      render(<TokenMeter currentBytes={50000} maxBytes={MAX_BYTES} />);
      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('aria-valuenow');
      expect(meter).toHaveAttribute('aria-valuemin', '0');
      expect(meter).toHaveAttribute('aria-valuemax');
    });

    it('should have descriptive aria-label', () => {
      render(<TokenMeter currentBytes={4000} maxBytes={MAX_BYTES} />);
      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Context size')
      );
      expect(meter).toHaveAttribute(
        'aria-label',
        expect.stringContaining('tokens')
      );
    });
  });

  describe('progress bar', () => {
    it('should display progress bar with correct width', () => {
      const { container } = render(<TokenMeter currentBytes={51200} maxBytes={MAX_BYTES} />);
      // 51200 / 102400 = 50% = ok status (green)
      const progressBar = container.querySelector('.bg-green-500');
      expect(progressBar).not.toBeNull();
      expect(progressBar?.getAttribute('style')).toContain('width: 50%');
    });

    it('should cap width at 100% when exceeding max', () => {
      const { container } = render(<TokenMeter currentBytes={120000} maxBytes={MAX_BYTES} />);
      // Exceeds 100% = exceeded status (red)
      const progressBar = container.querySelector('.bg-red-500');
      expect(progressBar).not.toBeNull();
      expect(progressBar?.getAttribute('style')).toContain('width: 100%');
    });
  });

  describe('color coding', () => {
    it('should use green color for ok status', () => {
      const { container } = render(<TokenMeter currentBytes={30000} maxBytes={MAX_BYTES} />);
      expect(container.querySelector('.bg-green-500')).toBeInTheDocument();
      expect(container.querySelector('.text-green-400')).toBeInTheDocument();
    });

    it('should use yellow color for warning status', () => {
      const { container } = render(<TokenMeter currentBytes={70000} maxBytes={MAX_BYTES} />);
      expect(container.querySelector('.bg-yellow-500')).toBeInTheDocument();
      expect(container.querySelector('.text-yellow-400')).toBeInTheDocument();
    });

    it('should use orange color for near_limit status', () => {
      const { container } = render(<TokenMeter currentBytes={85000} maxBytes={MAX_BYTES} />);
      expect(container.querySelector('.bg-orange-500')).toBeInTheDocument();
      expect(container.querySelector('.text-orange-400')).toBeInTheDocument();
    });

    it('should use red color for exceeded status', () => {
      const { container } = render(<TokenMeter currentBytes={98000} maxBytes={MAX_BYTES} />);
      expect(container.querySelector('.bg-red-500')).toBeInTheDocument();
      expect(container.querySelector('.text-red-400')).toBeInTheDocument();
    });
  });
});
