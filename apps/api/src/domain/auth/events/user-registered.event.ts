import { DomainEvent } from './domain-event.interface';

/**
 * UserRegisteredEvent - Domain Event
 *
 * Emitted when a new user successfully registers in the system.
 * Past tense naming convention (DDD best practice).
 *
 * ⚠️ SECURITY WARNING: Contains PII (email) and sensitive tokens.
 * DO NOT log this event directly. Use toSafeLog() for logging.
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C4, M6
 */

export class UserRegisteredEvent implements DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly verificationToken: string,
  ) {}

  /**
   * Returns sanitized event data safe for logging
   * Removes PII (email) and sensitive tokens
   */
  toSafeLog(): object {
    return {
      eventType: 'UserRegistered',
      userId: this.userId,
      // Email and token intentionally omitted
    };
  }
}
