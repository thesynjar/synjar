/**
 * VerificationToken Value Object
 *
 * Immutable, self-validating value object for email verification tokens.
 * Enforces token format validation (64-character hex string).
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C5
 */

import * as crypto from 'crypto';

export class VerificationToken {
  private constructor(private readonly value: string) {
    if (value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error('Invalid verification token format');
    }
  }

  /**
   * Create a new verification token (64-character hex string)
   * Uses crypto.randomBytes for secure random generation
   */
  static create(): VerificationToken {
    const token = crypto.randomBytes(32).toString('hex');
    return new VerificationToken(token);
  }

  /**
   * Reconstitute a VerificationToken from a string
   * Throws if the token format is invalid
   */
  static fromString(token: string): VerificationToken {
    return new VerificationToken(token);
  }

  /**
   * Get the underlying token string value
   */
  getValue(): string {
    return this.value;
  }
}
