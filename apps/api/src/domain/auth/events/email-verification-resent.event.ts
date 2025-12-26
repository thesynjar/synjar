import { DomainEvent } from './domain-event.interface';

/**
 * EmailVerificationResentEvent - Domain Event
 *
 * Emitted when a user requests a new verification email
 * (within system constraints - after cooldown period).
 * Past tense naming convention (DDD best practice).
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C4, M4
 */

export class EmailVerificationResentEvent implements DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly newVerificationToken: string,
  ) {}
}
