import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceUI } from '@/shared/contexts';

/**
 * WorkspaceSwitcher - Adaptive workspace navigation component
 *
 * Single workspace: Displays workspace name as text
 * Multi-workspace: Displays dropdown to switch between workspaces
 *
 * See: docs/specifications/2025-12-30-navigation-redesign.md (Section 2.2)
 */
interface WorkspaceSwitcherProps {
  className?: string;
}

export function WorkspaceSwitcher({ className = '' }: WorkspaceSwitcherProps) {
  const { currentWorkspace, workspaces, isMultiWorkspace, switchWorkspace, isLoading } =
    useWorkspaceUI();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
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

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center ${className}`}>
        <div className="h-4 w-24 bg-slate-700 rounded animate-pulse" />
      </div>
    );
  }

  // No workspace selected (e.g., on /workspaces list page)
  if (!currentWorkspace) {
    return null;
  }

  // Single workspace - just display name
  if (!isMultiWorkspace) {
    return (
      <span className={`text-white font-medium truncate max-w-[200px] ${className}`}>
        {currentWorkspace.name}
      </span>
    );
  }

  // Multi-workspace - dropdown
  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-white hover:bg-slate-700 rounded-md transition-colors"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Current workspace: ${currentWorkspace.name}. Click to switch workspace.`}
      >
        <span className="font-medium truncate max-w-[200px]">{currentWorkspace.name}</span>
        <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1 z-50"
        >
          <div className="px-4 py-2 border-b border-slate-700">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Workspaces
            </span>
          </div>

          <div className="max-h-60 overflow-auto py-1">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                role="menuitem"
                onClick={() => {
                  switchWorkspace(workspace.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <span className="truncate">{workspace.name}</span>
                {workspace.id === currentWorkspace.id && <CheckIcon className="h-4 w-4 text-green-500 flex-shrink-0" />}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-700 py-1">
            <button
              role="menuitem"
              onClick={() => {
                navigate('/workspaces');
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <GridIcon className="h-4 w-4" />
              Manage all workspaces
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
      />
    </svg>
  );
}
