import { DomainEvent } from './domain-event.interface';

/**
 * UserRegisteredEvent - Domain Event
 *
 * Emitted when a new user successfully registers in the system.
 * Past tense naming convention (DDD best practice).
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C4
 */

export class UserRegisteredEvent implements DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly verificationToken: string,
  ) {}
}
