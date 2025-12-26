/**
 * Password Validation Utility
 *
 * Enforces password security requirements:
 * - Minimum 12 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 *
 * @see docs/specifications/2025-12-26-dual-mode-registration.md Section 3.5
 */

/**
 * Password validation result
 *
 * @property valid - True if password meets all requirements
 * @property errors - Array of error messages (empty if valid)
 */
export interface PasswordValidationResult {
  /** True if password meets all security requirements */
  valid: boolean;
  /** Array of validation error messages (empty if valid) */
  errors: string[];
}

export class PasswordValidator {
  private static readonly MIN_LENGTH = 12;
  private static readonly UPPERCASE_REGEX = /[A-Z]/;
  private static readonly LOWERCASE_REGEX = /[a-z]/;
  private static readonly NUMBER_REGEX = /\d/;
  private static readonly SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

  /**
   * Validate password against security requirements
   *
   * @param password - The password to validate
   * @returns Validation result with errors if any
   */
  static validate(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (password.length < this.MIN_LENGTH) {
      errors.push('Password must be at least 12 characters');
    }

    if (!this.UPPERCASE_REGEX.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!this.LOWERCASE_REGEX.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!this.NUMBER_REGEX.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!this.SPECIAL_CHAR_REGEX.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
