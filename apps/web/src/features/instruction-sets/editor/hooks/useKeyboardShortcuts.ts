import { useEffect } from 'react';

interface UseKeyboardShortcutsParams {
  onSave: () => void;
  onBack: () => void;
}

export function useKeyboardShortcuts({
  onSave,
  onBack,
}: UseKeyboardShortcutsParams): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S - Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave();
      }

      // Escape - Go back
      if (e.key === 'Escape') {
        onBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave, onBack]);
}
