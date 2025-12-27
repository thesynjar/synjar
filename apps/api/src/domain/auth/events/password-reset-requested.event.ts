import { DomainEvent } from './domain-event.interface';

/**
 * PasswordResetRequestedEvent - Domain Event
 *
 * Emitted when a user requests a password reset.
 * Past tense naming convention (DDD best practice).
 *
 * Note: Does NOT contain the reset token - that is returned
 * separately to the use case for secure handling.
 *
 * @see docs/specifications/2025-12-27-password-reset.md
 */

export class PasswordResetRequestedEvent implements DomainEvent {
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
      eventType: 'PasswordResetRequested',
      userId: this.userId,
      // Email intentionally omitted
    };
  }
}
