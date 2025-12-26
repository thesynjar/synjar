import { PasswordValidator } from './password.validator';

describe('PasswordValidator', () => {
  describe('validate', () => {
    it('should reject password < 12 characters', () => {
      const result = PasswordValidator.validate('Short1!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        requirement: 'Password must be at least 12 characters',
        met: false,
      });
    });

    it('should require uppercase letter', () => {
      const result = PasswordValidator.validate('lowercase123!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        requirement: 'Password must contain at least one uppercase letter',
        met: false,
      });
    });

    it('should require lowercase letter', () => {
      const result = PasswordValidator.validate('UPPERCASE123!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        requirement: 'Password must contain at least one lowercase letter',
        met: false,
      });
    });

    it('should require number', () => {
      const result = PasswordValidator.validate('NoNumbersHere!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        requirement: 'Password must contain at least one number',
        met: false,
      });
    });

    it('should require special character', () => {
      const result = PasswordValidator.validate('NoSpecial123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        requirement: 'Password must contain at least one special character',
        met: false,
      });
    });

    it('should accept valid password', () => {
      const result = PasswordValidator.validate('ValidPass123!');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(5);
      result.errors.forEach((error) => {
        expect(error.met).toBe(true);
      });
    });

    it('should return multiple errors for invalid password', () => {
      const result = PasswordValidator.validate('short');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(5);
      expect(result.errors).toContainEqual({
        requirement: 'Password must be at least 12 characters',
        met: false,
      });
      expect(result.errors).toContainEqual({
        requirement: 'Password must contain at least one uppercase letter',
        met: false,
      });
      expect(result.errors).toContainEqual({
        requirement: 'Password must contain at least one number',
        met: false,
      });
      expect(result.errors).toContainEqual({
        requirement: 'Password must contain at least one special character',
        met: false,
      });
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
