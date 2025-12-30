import { describe, it, expect } from 'vitest';
import { isValidUUID, UUID_V4_REGEX } from '../validation';

describe('UUID validation', () => {
  describe('isValidUUID', () => {
    const VALID_UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';
    const VALID_UUID_V4_UPPERCASE = '550E8400-E29B-41D4-A716-446655440000';
    const VALID_UUID_V4_MIXED = '550e8400-E29B-41d4-A716-446655440000';

    it('should return true for valid UUID v4 lowercase', () => {
      expect(isValidUUID(VALID_UUID_V4)).toBe(true);
    });

    it('should return true for valid UUID v4 uppercase', () => {
      expect(isValidUUID(VALID_UUID_V4_UPPERCASE)).toBe(true);
    });

    it('should return true for valid UUID v4 mixed case', () => {
      expect(isValidUUID(VALID_UUID_V4_MIXED)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });

    it('should return false for non-UUID string', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });

    it('should return false for UUID v1 (wrong version digit)', () => {
      const v1uuid = '550e8400-e29b-11d4-a716-446655440000'; // 1xxx instead of 4xxx
      expect(isValidUUID(v1uuid)).toBe(false);
    });

    it('should return false for UUID with invalid variant', () => {
      const invalidVariant = '550e8400-e29b-41d4-0716-446655440000'; // 0xxx instead of [89ab]xxx
      expect(isValidUUID(invalidVariant)).toBe(false);
    });

    it('should return false for UUID with wrong length', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000')).toBe(false); // too short
      expect(isValidUUID('550e8400-e29b-41d4-a716-4466554400000')).toBe(false); // too long
    });

    it('should return false for UUID with invalid characters', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
    });

    it('should return false for potential XSS payload', () => {
      expect(isValidUUID('<script>alert(1)</script>')).toBe(false);
    });

    it('should return false for path traversal attempt', () => {
      expect(isValidUUID('../../../etc/passwd')).toBe(false);
    });

    it('should return false for URL injection attempt', () => {
      expect(isValidUUID('https://evil.com')).toBe(false);
    });
  });

  describe('UUID_V4_REGEX', () => {
    it('should be a valid regex', () => {
      expect(UUID_V4_REGEX).toBeInstanceOf(RegExp);
    });

    it('should be case insensitive', () => {
      expect(UUID_V4_REGEX.flags).toContain('i');
    });
  });
});
