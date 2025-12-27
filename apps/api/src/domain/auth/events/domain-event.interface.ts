/**
 * DomainEvent - Base interface for all domain events
 *
 * Marker interface ensuring type safety for domain events collection.
 * All domain events should implement or extend this interface.
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section M4
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DomainEvent {
  // Marker interface - no required properties
  // Each event defines its own readonly properties
}
