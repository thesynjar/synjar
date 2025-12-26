/**
 * User Aggregate - Auth Domain
 *
 * Controls user lifecycle, enforces invariants, and encapsulates business logic
 * for authentication and email verification.
 *
 * Business Logic:
 * - Grace period: 15 minutes for unverified users to login
 * - Resend cooldown: 60 seconds between verification emails
 * - Email verification state management
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C4
 */

import { Email } from './value-objects/email.value-object';
import { VerificationToken } from './value-objects/verification-token.value-object';

// Module-level constants for timing
const GRACE_PERIOD_MINUTES = 15;
const GRACE_PERIOD_MS = GRACE_PERIOD_MINUTES * 60 * 1000;

const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN_SECONDS * 1000;

export class UserAggregate {
  private constructor(
    private readonly id: string,
    private readonly email: Email,
    private readonly passwordHash: string,
    private isEmailVerified: boolean,
    private verificationToken: VerificationToken | null,
    private verificationSentAt: Date | null,
    private readonly createdAt: Date,
  ) {}

  /**
   * Factory method to create a new User aggregate
   * Used when registering a new user
   */
  static create(
    id: string,
    email: string,
    passwordHash: string,
  ): UserAggregate {
    const emailVO = Email.create(email);
    const token = VerificationToken.create();

    return new UserAggregate(
      id,
      emailVO,
      passwordHash,
      false, // not verified initially
      token,
      new Date(),
      new Date(),
    );
  }

  /**
   * Factory method to reconstitute User aggregate from database data
   * Used when loading existing user from repository
   */
  static reconstitute(userData: {
    id: string;
    email: string;
    passwordHash: string;
    isEmailVerified: boolean;
    emailVerificationToken: string | null;
    emailVerificationSentAt: Date | null;
    createdAt: Date;
  }): UserAggregate {
    return new UserAggregate(
      userData.id,
      Email.create(userData.email),
      userData.passwordHash,
      userData.isEmailVerified,
      userData.emailVerificationToken
        ? VerificationToken.fromString(userData.emailVerificationToken)
        : null,
      userData.emailVerificationSentAt,
      userData.createdAt,
    );
  }

  /**
   * Business Rule: Can user login without email verification?
   *
   * Returns true if:
   * - Email is already verified, OR
   * - Account is within 15-minute grace period
   */
  canLoginWithoutVerification(): boolean {
    if (this.isEmailVerified) {
      return true;
    }

    const accountAge = Date.now() - this.createdAt.getTime();
    return accountAge < GRACE_PERIOD_MS;
  }

  /**
   * Business Rule: Can user request verification email resend?
   *
   * Returns {can: false} if:
   * - Email is already verified
   * - Within 60-second cooldown period
   */
  canResendVerification(): { can: boolean; reason?: string } {
    if (this.isEmailVerified) {
      return { can: false, reason: 'Email already verified' };
    }

    if (this.verificationSentAt) {
      const timeSinceSent = Date.now() - this.verificationSentAt.getTime();
      if (timeSinceSent < RESEND_COOLDOWN_MS) {
        return { can: false, reason: 'Please wait before requesting another email' };
      }
    }

    return { can: true };
  }

  /**
   * Command: Resend verification email
   *
   * Generates new verification token and updates sent timestamp.
   * Enforces cooldown period (throws if within cooldown).
   *
   * @returns New VerificationToken
   * @throws Error if cooldown not elapsed or email already verified
   */
  resendVerification(): VerificationToken {
    const result = this.canResendVerification();
    if (!result.can) {
      throw new Error(result.reason);
    }

    this.verificationToken = VerificationToken.create();
    this.verificationSentAt = new Date();
    return this.verificationToken;
  }

  /**
   * Command: Verify user's email address
   *
   * Marks email as verified and clears verification token.
   *
   * @throws Error if email is already verified
   */
  verifyEmail(): void {
    if (this.isEmailVerified) {
      throw new Error('Email already verified');
    }
    this.isEmailVerified = true;
    this.verificationToken = null;
  }

  // Getters for accessing aggregate state
  getId(): string {
    return this.id;
  }

  getEmail(): string {
    return this.email.getValue();
  }

  getPasswordHash(): string {
    return this.passwordHash;
  }

  getIsEmailVerified(): boolean {
    return this.isEmailVerified;
  }

  getVerificationToken(): string | null {
    return this.verificationToken?.getValue() ?? null;
  }

  getVerificationSentAt(): Date | null {
    return this.verificationSentAt;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }
}
