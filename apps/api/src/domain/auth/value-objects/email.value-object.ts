/**
 * Email Value Object
 *
 * Immutable, self-validating value object for email addresses.
 * Enforces email format validation and normalization.
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C5
 */

export class Email {
  private constructor(private readonly value: string) {
    if (!this.isValid(value)) {
      throw new Error('Invalid email format');
    }
  }

  /**
   * Create Email value object from string
   * Automatically normalizes email (lowercase, trim)
   */
  static create(email: string): Email {
    return new Email(email.toLowerCase().trim());
  }

  /**
   * Validate email format using regex
   */
  private isValid(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  /**
   * Get the underlying email string value
   */
  getValue(): string {
    return this.value;
  }

  /**
   * Check equality with another Email value object
   */
  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
