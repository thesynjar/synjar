import { DomainEvent } from './domain-event.interface';

/**
 * EmailVerificationResentEvent - Domain Event
 *
 * Emitted when a user requests a new verification email
 * (within system constraints - after cooldown period).
 * Past tense naming convention (DDD best practice).
 *
 * ⚠️ SECURITY WARNING: Contains PII (email) and sensitive tokens.
 * DO NOT log this event directly. Use toSafeLog() for logging.
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C4, M4, M6
 */

export class EmailVerificationResentEvent implements DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly newVerificationToken: string,
  ) {}

  /**
   * Returns sanitized event data safe for logging
   * Removes PII (email) and sensitive tokens
   */
  toSafeLog(): object {
    return {
      eventType: 'EmailVerificationResent',
      userId: this.userId,
      // Email and newVerificationToken intentionally omitted
    };
  }
}
