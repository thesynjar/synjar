import { renderHook, act } from '@testing-library/react';
import { useUnsavedChanges } from '../useUnsavedChanges';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('useUnsavedChanges', () => {
  const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('beforeunload event', () => {
    it('should add beforeunload event listener on mount', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      renderHook(() =>
        useUnsavedChanges({
          workspaceId: WORKSPACE_ID,
          hasUnsavedChanges: false,
        })
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });

    it('should remove beforeunload event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() =>
        useUnsavedChanges({
          workspaceId: WORKSPACE_ID,
          hasUnsavedChanges: false,
        })
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });

    it('should prevent default and set returnValue when there are unsaved changes', () => {
      renderHook(() =>
        useUnsavedChanges({
          workspaceId: WORKSPACE_ID,
          hasUnsavedChanges: true,
        })
      );

      const event = new Event('beforeunload') as BeforeUnloadEvent;
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      Object.defineProperty(event, 'returnValue', {
        writable: true,
        value: '',
      });

      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(event.returnValue).toBe('');
    });

    it('should not prevent default when there are no unsaved changes', () => {
      renderHook(() =>
        useUnsavedChanges({
          workspaceId: WORKSPACE_ID,
          hasUnsavedChanges: false,
        })
      );

      const event = new Event('beforeunload') as BeforeUnloadEvent;
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      window.dispatchEvent(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should update event listener when hasUnsavedChanges changes', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { rerender } = renderHook(
        ({ hasUnsavedChanges }) =>
          useUnsavedChanges({
            workspaceId: WORKSPACE_ID,
            hasUnsavedChanges,
          }),
        { initialProps: { hasUnsavedChanges: false } }
      );

      // Initial mount adds listener
      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);

      // Change hasUnsavedChanges
      rerender({ hasUnsavedChanges: true });

      // Should remove old listener and add new one
      expect(removeEventListenerSpy).toHaveBeenCalled();
      expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleBack', () => {
    it('should navigate to workspace instruction-sets tab when no unsaved changes', () => {
      const { result } = renderHook(() =>
        useUnsavedChanges({
          workspaceId: WORKSPACE_ID,
          hasUnsavedChanges: false,
        })
      );

      act(() => {
        result.current.handleBack();
      });

      expect(window.confirm).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(
        `/workspaces/${WORKSPACE_ID}?tab=instruction-sets`
      );
    });

    it('should show confirmation dialog when there are unsaved changes', () => {
      const { result } = renderHook(() =>
        useUnsavedChanges({
          workspaceId: WORKSPACE_ID,
          hasUnsavedChanges: true,
        })
      );

      act(() => {
        result.current.handleBack();
      });

      expect(window.confirm).toHaveBeenCalledWith(
        'You have unsaved changes. Are you sure you want to leave?'
      );
    });

    it('should navigate when user confirms leaving with unsaved changes', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      const { result } = renderHook(() =>
        useUnsavedChanges({
          workspaceId: WORKSPACE_ID,
          hasUnsavedChanges: true,
        })
      );

      act(() => {
        result.current.handleBack();
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        `/workspaces/${WORKSPACE_ID}?tab=instruction-sets`
      );
    });

    it('should not navigate when user cancels confirmation dialog', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      const { result } = renderHook(() =>
        useUnsavedChanges({
          workspaceId: WORKSPACE_ID,
          hasUnsavedChanges: true,
        })
      );

      act(() => {
        result.current.handleBack();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should handle undefined workspaceId', () => {
      const { result } = renderHook(() =>
        useUnsavedChanges({
          workspaceId: undefined,
          hasUnsavedChanges: false,
        })
      );

      act(() => {
        result.current.handleBack();
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        '/workspaces/undefined?tab=instruction-sets'
      );
    });
  });

  describe('return value stability', () => {
    it('should return stable handleBack reference when dependencies do not change', () => {
      const { result, rerender } = renderHook(() =>
        useUnsavedChanges({
          workspaceId: WORKSPACE_ID,
          hasUnsavedChanges: false,
        })
      );

      const firstHandleBack = result.current.handleBack;
      rerender();
      const secondHandleBack = result.current.handleBack;

      expect(firstHandleBack).toBe(secondHandleBack);
    });

    it('should update handleBack reference when hasUnsavedChanges changes', () => {
      const { result, rerender } = renderHook(
        ({ hasUnsavedChanges }) =>
          useUnsavedChanges({
            workspaceId: WORKSPACE_ID,
            hasUnsavedChanges,
          }),
        { initialProps: { hasUnsavedChanges: false } }
      );

      const firstHandleBack = result.current.handleBack;
      rerender({ hasUnsavedChanges: true });
      const secondHandleBack = result.current.handleBack;

      expect(firstHandleBack).not.toBe(secondHandleBack);
    });
  });
});
