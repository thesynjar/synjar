import { createHash } from 'crypto';

/**
 * Hashes an email address using SHA-256.
 * Used for tenant-user email lookup to prevent email leakage while maintaining lookup capability.
 *
 * @param email - The email address to hash
 * @returns SHA-256 hex digest of the normalized email
 *
 * @example
 * const hash = hashEmail('user@example.com');
 * // Returns: '04f8996da763b7a969b1028ee3007569eaf3a635486ddab211d512c85b9df8fb'
 */
export function hashEmail(email: string): string {
  // Normalize: trim whitespace and convert to lowercase for consistency
  const normalized = email.toLowerCase().trim();

  // Hash using SHA-256
  return createHash('sha256').update(normalized).digest('hex');
}
