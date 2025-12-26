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
 * Individual password requirement with validation status
 *
 * Represents a single password security requirement (e.g., "at least 12 characters")
 * along with whether the provided password meets that requirement.
 *
 * @interface PasswordRequirement
 * @property {string} requirement - Human-readable description of the requirement
 * @property {boolean} met - True if the password satisfies this requirement
 *
 * @example
 * {
 *   requirement: "At least 12 characters",
 *   met: true
 * }
 */
export interface PasswordRequirement {
  /** Human-readable description of the requirement */
  requirement: string;
  /** True if password meets this requirement */
  met: boolean;
}

/**
 * Password validation result
 *
 * Value object representing the outcome of password validation against security requirements.
 * Used by registration and invite acceptance flows to enforce password complexity.
 *
 * @interface PasswordValidationResult
 * @property {boolean} valid - True if password meets all security requirements (min 12 chars, uppercase, lowercase, number, special char)
 * @property {PasswordRequirement[]} errors - Array of requirements with validation status. All items have met=true if valid=true.
 *
 * @example
 * const result = PasswordValidator.validate('MyPassword123!');
 * if (result.valid) {
 *   // Password is secure
 * } else {
 *   // Show result.errors to user with visual indicators (✓/✗)
 *   result.errors.forEach(req => {
 *     console.log(`${req.met ? '✓' : '✗'} ${req.requirement}`);
 *   });
 * }
 */
export interface PasswordValidationResult {
  /** True if password meets all security requirements */
  valid: boolean;
  /** Array of requirements with validation status */
  errors: PasswordRequirement[];
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
   * @returns Validation result with requirement status
   */
  static validate(password: string): PasswordValidationResult {
    const errors: PasswordRequirement[] = [];

    const lengthMet = password.length >= this.MIN_LENGTH;
    errors.push({
      requirement: 'Password must be at least 12 characters',
      met: lengthMet,
    });

    const uppercaseMet = this.UPPERCASE_REGEX.test(password);
    errors.push({
      requirement: 'Password must contain at least one uppercase letter',
      met: uppercaseMet,
    });

    const lowercaseMet = this.LOWERCASE_REGEX.test(password);
    errors.push({
      requirement: 'Password must contain at least one lowercase letter',
      met: lowercaseMet,
    });

    const numberMet = this.NUMBER_REGEX.test(password);
    errors.push({
      requirement: 'Password must contain at least one number',
      met: numberMet,
    });

    const specialCharMet = this.SPECIAL_CHAR_REGEX.test(password);
    errors.push({
      requirement: 'Password must contain at least one special character',
      met: specialCharMet,
    });

    return {
      valid: lengthMet && uppercaseMet && lowercaseMet && numberMet && specialCharMet,
      errors,
    };
  }
}
