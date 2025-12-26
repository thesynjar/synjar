import { BadRequestException } from '@nestjs/common';
import { PasswordRequirement } from '@/domain/auth/validators/password.validator';

/**
 * WeakPasswordException
 *
 * Thrown when a password fails to meet security requirements.
 *
 * HTTP Status: 400 Bad Request
 * Error Code: WEAK_PASSWORD
 *
 * Usage:
 * - Registration: Password doesn't meet complexity requirements
 * - Invite acceptance: Password too weak
 *
 * Includes detailed requirement breakdown (met/unmet) for client display.
 *
 * @see H8 in docs/agents/code-quality-reviewer/reports/2025-12-26-phase4-review.md
 * @see H5: Password Error Structure
 */
export class WeakPasswordException extends BadRequestException {
  constructor(requirements: PasswordRequirement[]) {
    super({
      errorCode: 'WEAK_PASSWORD',
      message: 'Password does not meet security requirements',
      requirements,
    });
  }
}
