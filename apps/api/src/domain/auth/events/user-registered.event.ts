/**
 * UserRegisteredEvent - Domain Event
 *
 * Emitted when a new user successfully registers in the system.
 * Past tense naming convention (DDD best practice).
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section C4
 */

export class UserRegisteredEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly verificationToken: string,
  ) {}
}
