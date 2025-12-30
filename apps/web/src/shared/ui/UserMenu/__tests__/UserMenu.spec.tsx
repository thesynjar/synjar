import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserMenu } from '../UserMenu';

// Mock config
vi.mock('@/shared/config', () => ({
  config: {
    docsUrl: 'https://docs.synjar.com',
  },
}));

describe('UserMenu', () => {
  const mockUser = { email: 'test@example.com' };
  const mockOnLogout = vi.fn();

  beforeEach(() => {
    mockOnLogout.mockClear();
  });

  describe('rendering', () => {
    it('should render user email in trigger button', () => {
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('should render dropdown closed by default', () => {
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('should truncate long email addresses', () => {
      const longEmail = { email: 'verylongemailaddress@verylongdomain.example.com' };
      render(<UserMenu user={longEmail} onLogout={mockOnLogout} />);

      const emailElement = screen.getByText(longEmail.email);
      expect(emailElement).toHaveClass('truncate');
      expect(emailElement).toHaveClass('max-w-[200px]');
    });
  });

  describe('dropdown interaction', () => {
    it('should open dropdown on click', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      const trigger = screen.getByRole('button', { name: /user menu/i });
      await user.click(trigger);

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('should close dropdown on second click', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      const trigger = screen.getByRole('button', { name: /user menu/i });
      await user.click(trigger);
      await user.click(trigger);

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('should close dropdown on outside click', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <UserMenu user={mockUser} onLogout={mockOnLogout} />
          <button data-testid="outside">Outside</button>
        </div>
      );

      const trigger = screen.getByRole('button', { name: /user menu/i });
      await user.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.click(screen.getByTestId('outside'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('menu items', () => {
    it('should show email header in dropdown', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      await user.click(screen.getByRole('button', { name: /user menu/i }));

      expect(screen.getByText('Signed in as')).toBeInTheDocument();
      expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0);
    });

    it('should show disabled Settings item with "Coming soon"', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      await user.click(screen.getByRole('button', { name: /user menu/i }));

      const settingsItem = screen.getByRole('menuitem', { name: /settings/i });
      expect(settingsItem).toBeDisabled();
      expect(screen.getByText('Coming soon')).toBeInTheDocument();
    });

    it('should show Documentation link', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      await user.click(screen.getByRole('button', { name: /user menu/i }));

      const docsLink = screen.getByRole('menuitem', { name: /documentation/i });
      expect(docsLink).toHaveAttribute('href', 'https://docs.synjar.com');
      expect(docsLink).toHaveAttribute('target', '_blank');
      expect(docsLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should show Logout button', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      await user.click(screen.getByRole('button', { name: /user menu/i }));

      expect(screen.getByRole('menuitem', { name: /logout/i })).toBeInTheDocument();
    });
  });

  describe('logout', () => {
    it('should call onLogout when clicking Logout', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      await user.click(screen.getByRole('button', { name: /user menu/i }));
      await user.click(screen.getByRole('menuitem', { name: /logout/i }));

      expect(mockOnLogout).toHaveBeenCalledTimes(1);
    });

    it('should close menu after clicking Logout', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      await user.click(screen.getByRole('button', { name: /user menu/i }));
      await user.click(screen.getByRole('menuitem', { name: /logout/i }));

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('should show loading state when logging out', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} isLoggingOut={true} />);

      await user.click(screen.getByRole('button', { name: /user menu/i }));

      const logoutButton = screen.getByRole('menuitem', { name: /logging out/i });
      expect(logoutButton).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('should have aria-haspopup on trigger', () => {
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      const trigger = screen.getByRole('button', { name: /user menu/i });
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('should have aria-expanded=false when closed', () => {
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      const trigger = screen.getByRole('button', { name: /user menu/i });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('should have aria-expanded=true when open', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      const trigger = screen.getByRole('button', { name: /user menu/i });
      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('should close on Escape key', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      const trigger = screen.getByRole('button', { name: /user menu/i });
      await user.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('should have descriptive aria-label with email', () => {
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      const trigger = screen.getByRole('button', { name: /user menu/i });
      expect(trigger).toHaveAttribute('aria-label', `User menu for ${mockUser.email}`);
    });

    it('should have menuitem roles on menu items', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      await user.click(screen.getByRole('button', { name: /user menu/i }));

      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems.length).toBe(3); // Settings, Documentation, Logout
    });

    it('should have aria-disabled on disabled Settings', async () => {
      const user = userEvent.setup();
      render(<UserMenu user={mockUser} onLogout={mockOnLogout} />);

      await user.click(screen.getByRole('button', { name: /user menu/i }));

      const settingsItem = screen.getByRole('menuitem', { name: /settings/i });
      expect(settingsItem).toHaveAttribute('aria-disabled', 'true');
    });
  });
});
