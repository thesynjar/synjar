import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('useKeyboardShortcuts', () => {
  const mockOnSave = vi.fn();
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call onSave when Ctrl+S pressed', () => {
    renderHook(() =>
      useKeyboardShortcuts({ onSave: mockOnSave, onBack: mockOnBack })
    );

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
    window.dispatchEvent(event);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
  });

  it('should call onSave when Cmd+S pressed (Mac)', () => {
    renderHook(() =>
      useKeyboardShortcuts({ onSave: mockOnSave, onBack: mockOnBack })
    );

    const event = new KeyboardEvent('keydown', { key: 's', metaKey: true });
    window.dispatchEvent(event);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
  });

  it('should call onBack when Escape pressed', () => {
    renderHook(() =>
      useKeyboardShortcuts({ onSave: mockOnSave, onBack: mockOnBack })
    );

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('should remove event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onSave: mockOnSave, onBack: mockOnBack })
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function)
    );
    removeEventListenerSpy.mockRestore();
  });
});
