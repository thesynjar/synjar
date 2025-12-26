import { DomainEvent } from './domain-event.interface';

/**
 * EmailVerifiedEvent - Domain Event
 *
 * Emitted when a user successfully verifies their email address.
 * Past tense naming convention (DDD best practice).
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C4
 */

export class EmailVerifiedEvent implements DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}
}
