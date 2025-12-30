/**
 * User-friendly error messages mapped from API error codes.
 * Prevents information disclosure by mapping backend codes to safe messages.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  CONFLICT: 'This set was modified by another user. Please refresh and try again.',
  SIZE_LIMIT_EXCEEDED: 'Adding this document would exceed the size limit (100KB).',
  DOCUMENT_LIMIT_EXCEEDED: 'Maximum document limit (20) reached.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  DEFAULT: 'An error occurred. Please try again.',
};

/**
 * Get a user-friendly error message from an API error code.
 * Falls back to DEFAULT message if code is unknown.
 *
 * @param errorCode - The error code from the API response
 * @returns A user-friendly error message
 */
export function getUserFriendlyMessage(errorCode?: string): string {
  if (!errorCode) return ERROR_MESSAGES.DEFAULT;
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.DEFAULT;
}
