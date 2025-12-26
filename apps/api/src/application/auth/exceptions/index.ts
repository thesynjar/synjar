/**
 * Authentication Exception Classes
 *
 * Custom exceptions with error codes for authentication flows.
 * All exceptions follow NestJS exception hierarchy and include:
 * - errorCode: Machine-readable error identifier
 * - message: Human-readable error description
 * - hint: Optional guidance for resolution
 *
 * @see H8 in docs/agents/code-quality-reviewer/reports/2025-12-26-phase4-review.md
 */

export { RegistrationDisabledException } from './registration-disabled.exception';
export { EmailNotVerifiedException } from './email-not-verified.exception';
export { WeakPasswordException } from './weak-password.exception';
export { InvitationExpiredException } from './invitation-expired.exception';
