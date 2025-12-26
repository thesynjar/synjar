import { BadRequestException } from '@nestjs/common';

/**
 * InvitationExpiredException
 *
 * Thrown when a user attempts to accept an expired invitation.
 *
 * HTTP Status: 400 Bad Request
 * Error Code: INVITATION_EXPIRED
 *
 * Usage:
 * - Invitation accept: Token exists but expiration date passed
 * - Indicates user must request new invitation from admin
 *
 * @see H8 in docs/agents/code-quality-reviewer/reports/2025-12-26-phase4-review.md
 * @see ADR-002: Persistent Invitation Model
 */
export class InvitationExpiredException extends BadRequestException {
  constructor() {
    super({
      errorCode: 'INVITATION_EXPIRED',
      message: 'This invitation has expired',
      hint: 'Please request a new invitation from your workspace administrator',
    });
  }
}
