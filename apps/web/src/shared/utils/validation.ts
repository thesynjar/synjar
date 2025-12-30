/**
 * UUID v4 validation regex.
 * Validates format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where y is [89ab] (variant bits)
 *
 * Used for defense in depth against open redirect and XSS attacks.
 * See: docs/specifications/2025-12-30-navigation-redesign.md
 */
export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID v4.
 *
 * @param value - The string to validate
 * @returns true if valid UUID v4, false otherwise
 */
export function isValidUUID(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}
