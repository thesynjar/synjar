import { useState, useRef, useEffect } from 'react';
import { config } from '@/shared/config';

interface UserMenuProps {
  user: { email: string };
  onLogout: () => void;
  isLoggingOut?: boolean;
}

/**
 * User Menu Dropdown component
 *
 * Provides user account options including:
 * - Email display
 * - Settings (disabled - coming soon)
 * - Documentation link
 * - Logout
 *
 * Accessibility:
 * - aria-haspopup="menu" on trigger
 * - aria-expanded state
 * - Keyboard navigation (Escape to close)
 * - Arrow key navigation between menu items
 * - Focus moves to first menu item when opening
 *
 * See: docs/specifications/2025-12-30-navigation-redesign.md
 */
export function UserMenu({ user, onLogout, isLoggingOut = false }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation (Escape to close)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  // Focus first menu item when opening
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const firstFocusable = dropdownRef.current.querySelector('[role="menuitem"]:not([disabled]):not([aria-disabled="true"])');
      (firstFocusable as HTMLElement)?.focus();
    }
  }, [isOpen]);

  // Handle arrow key navigation within menu
  function handleMenuKeyDown(event: React.KeyboardEvent) {
    const items = Array.from(
      dropdownRef.current?.querySelectorAll('[role="menuitem"]:not([disabled]):not([aria-disabled="true"])') || []
    );
    const currentIndex = items.indexOf(document.activeElement as Element);

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        (items[nextIndex] as HTMLElement)?.focus();
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
        (items[prevIndex] as HTMLElement)?.focus();
        break;
      }
    }
  }

  const handleLogout = () => {
    setIsOpen(false);
    onLogout();
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white transition-colors rounded-md hover:bg-slate-700"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`User menu for ${user.email}`}
      >
        <span className="text-sm truncate max-w-[200px]">
          {user.email}
        </span>
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1 z-50"
        >
          {/* User email header */}
          <div className="px-4 py-3 border-b border-slate-700">
            <span className="text-xs text-slate-500">Signed in as</span>
            <p className="text-sm font-medium text-white truncate">{user.email}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {/* Settings - disabled */}
            <button
              disabled
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-500 cursor-not-allowed"
              role="menuitem"
              aria-disabled="true"
              title="Settings page is under development. Stay tuned for user preferences, workspace settings, and more."
            >
              <SettingsIcon className="h-4 w-4" />
              Settings
              <span className="ml-auto text-xs text-slate-600">Coming soon</span>
            </button>

            {/* Documentation */}
            <a
              href={config.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              <ExternalLinkIcon className="h-4 w-4" />
              Documentation
            </a>
          </div>

          {/* Logout */}
          <div className="border-t border-slate-700 py-1">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors disabled:opacity-50"
              role="menuitem"
            >
              <LogoutIcon className="h-4 w-4" />
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline SVG icons to avoid external dependencies
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}
