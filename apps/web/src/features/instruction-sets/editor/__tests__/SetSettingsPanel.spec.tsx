import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetSettingsPanel } from '../SetSettingsPanel';

describe('SetSettingsPanel', () => {
  const defaultProps = {
    name: 'Test Set',
    description: 'Test description',
    isPublic: false,
    publicUrl: null,
    onNameChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onPublicChange: vi.fn(),
  };

  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    writeTextMock.mockClear();
    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('name field', () => {
    it('should display current name value', () => {
      render(<SetSettingsPanel {...defaultProps} name="My Set" />);
      const nameInput = screen.getByLabelText(/Name/);
      expect(nameInput).toHaveValue('My Set');
    });

    it('should show character count', () => {
      render(<SetSettingsPanel {...defaultProps} name="Hello" />);
      expect(screen.getByText('5/200 characters')).toBeInTheDocument();
    });

    it('should have maxLength attribute', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      const nameInput = screen.getByLabelText(/Name/);
      expect(nameInput).toHaveAttribute('maxLength', '200');
    });

    it('should call onNameChange when typing', async () => {
      const user = userEvent.setup();
      const onNameChange = vi.fn();
      render(<SetSettingsPanel {...defaultProps} onNameChange={onNameChange} />);

      const nameInput = screen.getByLabelText(/Name/);
      await user.clear(nameInput);
      await user.type(nameInput, 'New Name');

      expect(onNameChange).toHaveBeenCalled();
    });

    it('should show required indicator', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('should have required attribute', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      const nameInput = screen.getByLabelText(/Name/);
      expect(nameInput).toHaveAttribute('required');
    });

    it('should show placeholder text', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      const nameInput = screen.getByLabelText(/Name/);
      expect(nameInput).toHaveAttribute('placeholder', 'e.g., Brand Voice Guidelines');
    });
  });

  describe('description field', () => {
    it('should display current description value', () => {
      render(<SetSettingsPanel {...defaultProps} description="Test desc" />);
      const descInput = screen.getByLabelText(/Description/);
      expect(descInput).toHaveValue('Test desc');
    });

    it('should show character count for description', () => {
      render(<SetSettingsPanel {...defaultProps} description="Hello World" />);
      expect(screen.getByText('11/500 characters')).toBeInTheDocument();
    });

    it('should have maxLength attribute', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      const descInput = screen.getByLabelText(/Description/);
      expect(descInput).toHaveAttribute('maxLength', '500');
    });

    it('should call onDescriptionChange when typing', async () => {
      const user = userEvent.setup();
      const onDescriptionChange = vi.fn();
      render(<SetSettingsPanel {...defaultProps} onDescriptionChange={onDescriptionChange} />);

      const descInput = screen.getByLabelText(/Description/);
      await user.type(descInput, 'New description');

      expect(onDescriptionChange).toHaveBeenCalled();
    });

    it('should be a textarea with 3 rows', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      const descInput = screen.getByLabelText(/Description/);
      expect(descInput.tagName).toBe('TEXTAREA');
      expect(descInput).toHaveAttribute('rows', '3');
    });

    it('should show placeholder text', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      const descInput = screen.getByLabelText(/Description/);
      expect(descInput).toHaveAttribute(
        'placeholder',
        'Describe the purpose of this instruction set...'
      );
    });
  });

  describe('public toggle', () => {
    it('should show checkbox with correct label', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(screen.getByText('Anyone with link can access')).toBeInTheDocument();
    });

    it('should reflect isPublic state', () => {
      const { rerender } = render(<SetSettingsPanel {...defaultProps} isPublic={false} />);
      expect(screen.getByRole('checkbox')).not.toBeChecked();

      rerender(<SetSettingsPanel {...defaultProps} isPublic={true} />);
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('should call onPublicChange when checkbox toggled', async () => {
      const user = userEvent.setup();
      const onPublicChange = vi.fn();
      render(<SetSettingsPanel {...defaultProps} onPublicChange={onPublicChange} />);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(onPublicChange).toHaveBeenCalledWith(true);
    });

    it('should show description text for public toggle', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      expect(
        screen.getByText(/Make this instruction set publicly accessible/)
      ).toBeInTheDocument();
    });
  });

  describe('public URL display', () => {
    it('should not show URL section when not public', () => {
      render(<SetSettingsPanel {...defaultProps} isPublic={false} publicUrl={null} />);
      expect(screen.queryByText('Public URL')).not.toBeInTheDocument();
    });

    it('should not show URL section when public but URL is null', () => {
      render(<SetSettingsPanel {...defaultProps} isPublic={true} publicUrl={null} />);
      expect(screen.queryByText('Public URL')).not.toBeInTheDocument();
    });

    it('should show URL section when public and URL exists', () => {
      render(
        <SetSettingsPanel
          {...defaultProps}
          isPublic={true}
          publicUrl="https://example.com/s/123"
        />
      );
      expect(screen.getByText('Public URL')).toBeInTheDocument();
      expect(screen.getByText('https://example.com/s/123')).toBeInTheDocument();
    });

    it('should display URL in code element', () => {
      render(
        <SetSettingsPanel
          {...defaultProps}
          isPublic={true}
          publicUrl="https://example.com/s/123"
        />
      );
      const codeElement = screen.getByText('https://example.com/s/123');
      expect(codeElement.tagName).toBe('CODE');
    });
  });

  describe('public URL copy functionality', () => {
    it('should show copy button when public and URL exists', () => {
      render(
        <SetSettingsPanel
          {...defaultProps}
          isPublic={true}
          publicUrl="https://example.com/s/123"
        />
      );
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('should show "Copied!" feedback after click', async () => {
      const user = userEvent.setup();
      render(
        <SetSettingsPanel
          {...defaultProps}
          isPublic={true}
          publicUrl="https://example.com/s/123"
        />
      );

      await user.click(screen.getByText('Copy'));

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });

    it('should have aria-live for copy button', () => {
      render(
        <SetSettingsPanel
          {...defaultProps}
          isPublic={true}
          publicUrl="https://example.com/s/123"
        />
      );
      const copyButton = screen.getByText('Copy').closest('button');
      expect(copyButton).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('disabled state', () => {
    it('should disable all inputs when disabled prop is true', () => {
      render(<SetSettingsPanel {...defaultProps} disabled={true} />);

      expect(screen.getByLabelText(/Name/)).toBeDisabled();
      expect(screen.getByLabelText(/Description/)).toBeDisabled();
      expect(screen.getByRole('checkbox')).toBeDisabled();
    });

    it('should not disable inputs when disabled prop is false', () => {
      render(<SetSettingsPanel {...defaultProps} disabled={false} />);

      expect(screen.getByLabelText(/Name/)).not.toBeDisabled();
      expect(screen.getByLabelText(/Description/)).not.toBeDisabled();
      expect(screen.getByRole('checkbox')).not.toBeDisabled();
    });

    it('should not disable inputs by default', () => {
      render(<SetSettingsPanel {...defaultProps} />);

      expect(screen.getByLabelText(/Name/)).not.toBeDisabled();
      expect(screen.getByLabelText(/Description/)).not.toBeDisabled();
      expect(screen.getByRole('checkbox')).not.toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('should have proper label associations', () => {
      render(<SetSettingsPanel {...defaultProps} />);

      const nameInput = screen.getByLabelText(/Name/);
      expect(nameInput).toHaveAttribute('id', 'set-name');

      const descInput = screen.getByLabelText(/Description/);
      expect(descInput).toHaveAttribute('id', 'set-description');
    });

    it('should have heading for settings section', () => {
      render(<SetSettingsPanel {...defaultProps} />);
      const heading = screen.getByText('Settings');
      expect(heading.tagName).toBe('H3');
    });
  });
});
