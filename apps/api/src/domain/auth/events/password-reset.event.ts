import { DomainEvent } from './domain-event.interface';

/**
 * PasswordResetEvent - Domain Event
 *
 * Emitted when a user successfully resets their password.
 * Past tense naming convention (DDD best practice).
 *
 * @see docs/specifications/2025-12-27-password-reset.md
 */

export class PasswordResetEvent implements DomainEvent {
  constructor(public readonly userId: string) {}

  /**
   * Returns sanitized event data safe for logging
   */
  toSafeLog(): object {
    return {
      eventType: 'PasswordReset',
      userId: this.userId,
    };
  }
}
