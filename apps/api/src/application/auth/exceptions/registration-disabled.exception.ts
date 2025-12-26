import { ForbiddenException } from '@nestjs/common';

/**
 * RegistrationDisabledException
 *
 * Thrown when a user attempts to register on a self-hosted instance
 * where public registration is disabled (after first user created).
 *
 * HTTP Status: 403 Forbidden
 * Error Code: REGISTRATION_DISABLED
 *
 * Usage:
 * - Self-hosted mode: Second+ user attempts registration
 * - Indicates user must request invitation from admin
 *
 * @see H8 in docs/agents/code-quality-reviewer/reports/2025-12-26-phase4-review.md
 */
export class RegistrationDisabledException extends ForbiddenException {
  constructor(adminContact?: string) {
    super({
      errorCode: 'REGISTRATION_DISABLED',
      message: 'Public registration is disabled on this instance.',
      hint: 'Please contact the administrator to request access.',
      adminContact: adminContact || 'Contact your system administrator',
    });
  }
}
