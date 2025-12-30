import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLastWorkspace } from '../useLastWorkspace';

describe('useLastWorkspace', () => {
  const STORAGE_KEY = 'synjar:lastWorkspaceId';
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const ANOTHER_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('setLastWorkspace', () => {
    it('should store valid UUID in localStorage', () => {
      const { result } = renderHook(() => useLastWorkspace());

      act(() => {
        result.current.setLastWorkspace(VALID_UUID);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe(VALID_UUID);
    });

    it('should reject invalid UUID and not store', () => {
      const { result } = renderHook(() => useLastWorkspace());

      act(() => {
        result.current.setLastWorkspace('invalid-id');
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Attempted to store invalid workspace ID:',
        'invalid-id'
      );
    });

    it('should reject XSS payload and not store', () => {
      const { result } = renderHook(() => useLastWorkspace());
      const xssPayload = '<script>alert("xss")</script>';

      act(() => {
        result.current.setLastWorkspace(xssPayload);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });

    it('should reject empty string', () => {
      const { result } = renderHook(() => useLastWorkspace());

      act(() => {
        result.current.setLastWorkspace('');
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('should overwrite previous value with new valid UUID', () => {
      const { result } = renderHook(() => useLastWorkspace());

      act(() => {
        result.current.setLastWorkspace(VALID_UUID);
        result.current.setLastWorkspace(ANOTHER_UUID);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe(ANOTHER_UUID);
    });
  });

  describe('getLastWorkspace', () => {
    it('should return null when no workspace stored', () => {
      const { result } = renderHook(() => useLastWorkspace());

      expect(result.current.getLastWorkspace()).toBeNull();
    });

    it('should return valid UUID from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, VALID_UUID);
      const { result } = renderHook(() => useLastWorkspace());

      expect(result.current.getLastWorkspace()).toBe(VALID_UUID);
    });

    it('should clear and return null for corrupted data', () => {
      localStorage.setItem(STORAGE_KEY, 'corrupted-data');
      const { result } = renderHook(() => useLastWorkspace());

      expect(result.current.getLastWorkspace()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        'Corrupted workspace ID in localStorage, clearing'
      );
    });

    it('should clear and return null for XSS payload in storage', () => {
      localStorage.setItem(STORAGE_KEY, '<script>alert("xss")</script>');
      const { result } = renderHook(() => useLastWorkspace());

      expect(result.current.getLastWorkspace()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('clearLastWorkspace', () => {
    it('should remove workspace from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, VALID_UUID);
      const { result } = renderHook(() => useLastWorkspace());

      act(() => {
        result.current.clearLastWorkspace();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('should not throw when nothing to clear', () => {
      const { result } = renderHook(() => useLastWorkspace());

      expect(() => {
        act(() => {
          result.current.clearLastWorkspace();
        });
      }).not.toThrow();
    });
  });

  describe('UUID validation', () => {
    it('should accept lowercase UUIDs', () => {
      const { result } = renderHook(() => useLastWorkspace());
      const lowercase = '550e8400-e29b-41d4-a716-446655440000';

      act(() => {
        result.current.setLastWorkspace(lowercase);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe(lowercase);
    });

    it('should accept uppercase UUIDs', () => {
      const { result } = renderHook(() => useLastWorkspace());
      const uppercase = '550E8400-E29B-41D4-A716-446655440000';

      act(() => {
        result.current.setLastWorkspace(uppercase);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe(uppercase);
    });

    it('should reject UUID v1 format (wrong version digit)', () => {
      const { result } = renderHook(() => useLastWorkspace());
      const v1uuid = '550e8400-e29b-11d4-a716-446655440000'; // 1xxx instead of 4xxx

      act(() => {
        result.current.setLastWorkspace(v1uuid);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('should reject UUID with invalid variant', () => {
      const { result } = renderHook(() => useLastWorkspace());
      const invalidVariant = '550e8400-e29b-41d4-0716-446655440000'; // 0xxx instead of 8/9/a/b

      act(() => {
        result.current.setLastWorkspace(invalidVariant);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
