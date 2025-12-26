import { PasswordValidator } from './password.validator';

describe('PasswordValidator', () => {
  describe('validate', () => {
    it('should reject password < 12 characters', () => {
      const result = PasswordValidator.validate('Short1!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must be at least 12 characters',
      );
    });

    it('should require uppercase letter', () => {
      const result = PasswordValidator.validate('lowercase123!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one uppercase letter',
      );
    });

    it('should require lowercase letter', () => {
      const result = PasswordValidator.validate('UPPERCASE123!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one lowercase letter',
      );
    });

    it('should require number', () => {
      const result = PasswordValidator.validate('NoNumbersHere!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one number',
      );
    });

    it('should require special character', () => {
      const result = PasswordValidator.validate('NoSpecial123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one special character',
      );
    });

    it('should accept valid password', () => {
      const result = PasswordValidator.validate('ValidPass123!');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return multiple errors for invalid password', () => {
      const result = PasswordValidator.validate('short');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain(
        'Password must be at least 12 characters',
      );
      expect(result.errors).toContain(
        'Password must contain at least one uppercase letter',
      );
      expect(result.errors).toContain(
        'Password must contain at least one number',
      );
      expect(result.errors).toContain(
        'Password must contain at least one special character',
      );
    });

    it('should accept various special characters', () => {
      const passwords = [
        'ValidPass123!',
        'ValidPass123@',
        'ValidPass123#',
        'ValidPass123$',
        'ValidPass123%',
        'ValidPass123^',
        'ValidPass123&',
        'ValidPass123*',
      ];

      passwords.forEach((password) => {
        const result = PasswordValidator.validate(password);
        expect(result.valid).toBe(true);
      });
    });
  });
});
