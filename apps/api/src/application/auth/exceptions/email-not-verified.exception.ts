import { UnauthorizedException } from '@nestjs/common';

/**
 * EmailNotVerifiedException
 *
 * Thrown when a user attempts to login but their email is not verified
 * and they are outside the grace period.
 *
 * HTTP Status: 401 Unauthorized
 * Error Code: EMAIL_NOT_VERIFIED
 *
 * Usage:
 * - Cloud mode: User tries to login after grace period expired
 * - Indicates user must verify email to continue
 *
 * @see H8 in docs/agents/code-quality-reviewer/reports/2025-12-26-phase4-review.md
 * @see ADR-004: 15-Minute Grace Period
 */
export class EmailNotVerifiedException extends UnauthorizedException {
  constructor() {
    super({
      errorCode: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email before logging in',
      hint: 'Check your inbox or request a new verification email',
    });
  }
}
