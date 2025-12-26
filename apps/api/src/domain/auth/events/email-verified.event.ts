import { DomainEvent } from './domain-event.interface';

/**
 * EmailVerifiedEvent - Domain Event
 *
 * Emitted when a user successfully verifies their email address.
 * Past tense naming convention (DDD best practice).
 *
 * ⚠️ SECURITY WARNING: Contains PII (email).
 * DO NOT log this event directly. Use toSafeLog() for logging.
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C4, M6
 */

export class EmailVerifiedEvent implements DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}

  /**
   * Returns sanitized event data safe for logging
   * Removes PII (email)
   */
  toSafeLog(): object {
    return {
      eventType: 'EmailVerified',
      userId: this.userId,
      // Email intentionally omitted
    };
  }
}
