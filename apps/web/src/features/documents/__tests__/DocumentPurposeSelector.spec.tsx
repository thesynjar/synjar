import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentPurposeSelector } from '../DocumentPurposeSelector';

describe('DocumentPurposeSelector', () => {
  const defaultProps = {
    value: 'KNOWLEDGE' as const,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render both radio options (KNOWLEDGE and INSTRUCTION)', () => {
      render(<DocumentPurposeSelector {...defaultProps} />);

      expect(screen.getByLabelText('Knowledge')).toBeInTheDocument();
      expect(screen.getByLabelText('Instruction')).toBeInTheDocument();
    });

    it('should render Document Purpose label', () => {
      render(<DocumentPurposeSelector {...defaultProps} />);

      expect(screen.getByText('Document Purpose')).toBeInTheDocument();
    });

    it('should render subtext explaining purpose', () => {
      render(<DocumentPurposeSelector {...defaultProps} />);

      expect(screen.getByText('How this document will be used')).toBeInTheDocument();
    });

    it('should render help button with question mark', () => {
      render(<DocumentPurposeSelector {...defaultProps} />);

      const helpButton = screen.getByRole('button', { name: /document purpose information/i });
      expect(helpButton).toBeInTheDocument();
      expect(helpButton).toHaveTextContent('?');
    });
  });

  describe('value prop', () => {
    it('should check KNOWLEDGE radio when value is KNOWLEDGE', () => {
      render(<DocumentPurposeSelector {...defaultProps} value="KNOWLEDGE" />);

      const knowledgeRadio = screen.getByLabelText('Knowledge');
      const instructionRadio = screen.getByLabelText('Instruction');

      expect(knowledgeRadio).toBeChecked();
      expect(instructionRadio).not.toBeChecked();
    });

    it('should check INSTRUCTION radio when value is INSTRUCTION', () => {
      render(<DocumentPurposeSelector {...defaultProps} value="INSTRUCTION" />);

      const knowledgeRadio = screen.getByLabelText('Knowledge');
      const instructionRadio = screen.getByLabelText('Instruction');

      expect(knowledgeRadio).not.toBeChecked();
      expect(instructionRadio).toBeChecked();
    });
  });

  describe('onChange callback', () => {
    it('should call onChange with INSTRUCTION when clicking Instruction radio', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<DocumentPurposeSelector {...defaultProps} value="KNOWLEDGE" onChange={onChange} />);

      const instructionRadio = screen.getByLabelText('Instruction');
      await user.click(instructionRadio);

      expect(onChange).toHaveBeenCalledWith('INSTRUCTION');
    });

    it('should call onChange with KNOWLEDGE when clicking Knowledge radio', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<DocumentPurposeSelector {...defaultProps} value="INSTRUCTION" onChange={onChange} />);

      const knowledgeRadio = screen.getByLabelText('Knowledge');
      await user.click(knowledgeRadio);

      expect(onChange).toHaveBeenCalledWith('KNOWLEDGE');
    });
  });

  describe('disabled state', () => {
    it('should disable both radio inputs when disabled is true', () => {
      render(<DocumentPurposeSelector {...defaultProps} disabled={true} />);

      const knowledgeRadio = screen.getByLabelText('Knowledge');
      const instructionRadio = screen.getByLabelText('Instruction');

      expect(knowledgeRadio).toBeDisabled();
      expect(instructionRadio).toBeDisabled();
    });

    it('should not disable radio inputs when disabled is false', () => {
      render(<DocumentPurposeSelector {...defaultProps} disabled={false} />);

      const knowledgeRadio = screen.getByLabelText('Knowledge');
      const instructionRadio = screen.getByLabelText('Instruction');

      expect(knowledgeRadio).not.toBeDisabled();
      expect(instructionRadio).not.toBeDisabled();
    });

    it('should not disable radio inputs by default', () => {
      render(<DocumentPurposeSelector {...defaultProps} />);

      const knowledgeRadio = screen.getByLabelText('Knowledge');
      const instructionRadio = screen.getByLabelText('Instruction');

      expect(knowledgeRadio).not.toBeDisabled();
      expect(instructionRadio).not.toBeDisabled();
    });

    it('should not call onChange when clicking disabled radio', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <DocumentPurposeSelector {...defaultProps} value="KNOWLEDGE" onChange={onChange} disabled={true} />
      );

      const instructionRadio = screen.getByLabelText('Instruction');
      await user.click(instructionRadio);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('tooltip', () => {
    it('should not show tooltip by default', () => {
      render(<DocumentPurposeSelector {...defaultProps} />);

      expect(screen.queryByText(/Indexed for semantic search/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Only for Instruction Sets/)).not.toBeInTheDocument();
    });

    it('should show tooltip on mouse enter of help button', async () => {
      const user = userEvent.setup();
      render(<DocumentPurposeSelector {...defaultProps} />);

      const helpButton = screen.getByRole('button', { name: /document purpose information/i });
      await user.hover(helpButton);

      expect(screen.getByText(/Indexed for semantic search/)).toBeInTheDocument();
      expect(screen.getByText(/Only for Instruction Sets/)).toBeInTheDocument();
    });

    it('should hide tooltip on mouse leave of help button', async () => {
      const user = userEvent.setup();
      render(<DocumentPurposeSelector {...defaultProps} />);

      const helpButton = screen.getByRole('button', { name: /document purpose information/i });
      await user.hover(helpButton);

      expect(screen.getByText(/Indexed for semantic search/)).toBeInTheDocument();

      await user.unhover(helpButton);

      expect(screen.queryByText(/Indexed for semantic search/)).not.toBeInTheDocument();
    });

    it('should show tooltip on click of help button when already hovered', async () => {
      const user = userEvent.setup();
      render(<DocumentPurposeSelector {...defaultProps} />);

      const helpButton = screen.getByRole('button', { name: /document purpose information/i });

      // Hover first to show tooltip
      await user.hover(helpButton);
      expect(screen.getByText(/Indexed for semantic search/)).toBeInTheDocument();

      // Click toggles it off
      await user.click(helpButton);
      expect(screen.queryByText(/Indexed for semantic search/)).not.toBeInTheDocument();

      // Click again toggles it back on (while still hovered)
      await user.click(helpButton);
      expect(screen.getByText(/Indexed for semantic search/)).toBeInTheDocument();
    });

    it('should display Knowledge description in tooltip', async () => {
      const user = userEvent.setup();
      render(<DocumentPurposeSelector {...defaultProps} />);

      const helpButton = screen.getByRole('button', { name: /document purpose information/i });
      await user.hover(helpButton);

      expect(
        screen.getByText(/Indexed for semantic search \(Search Links\) and available in Instruction Sets/)
      ).toBeInTheDocument();
    });

    it('should display Instruction description in tooltip', async () => {
      const user = userEvent.setup();
      render(<DocumentPurposeSelector {...defaultProps} />);

      const helpButton = screen.getByRole('button', { name: /document purpose information/i });
      await user.hover(helpButton);

      expect(
        screen.getByText(/Only for Instruction Sets - full context for AI without semantic indexing/)
      ).toBeInTheDocument();
    });
  });

  describe('radio input attributes', () => {
    it('should have name attribute "purpose" on both radios', () => {
      render(<DocumentPurposeSelector {...defaultProps} />);

      const knowledgeRadio = screen.getByLabelText('Knowledge');
      const instructionRadio = screen.getByLabelText('Instruction');

      expect(knowledgeRadio).toHaveAttribute('name', 'purpose');
      expect(instructionRadio).toHaveAttribute('name', 'purpose');
    });

    it('should have type attribute "radio" on both inputs', () => {
      render(<DocumentPurposeSelector {...defaultProps} />);

      const knowledgeRadio = screen.getByLabelText('Knowledge');
      const instructionRadio = screen.getByLabelText('Instruction');

      expect(knowledgeRadio).toHaveAttribute('type', 'radio');
      expect(instructionRadio).toHaveAttribute('type', 'radio');
    });
  });
});
