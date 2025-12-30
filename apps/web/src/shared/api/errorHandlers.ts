import { parseApiErrorAsync } from './errors';
import { toast } from '@/shared/ui';

/**
 * Handles API errors by parsing and showing a toast notification.
 * Extracts suggestion or message from structured API errors.
 *
 * @param error - The error to handle
 * @param fallbackMessage - Message to show if error cannot be parsed
 */
export async function handleApiError(
  error: unknown,
  fallbackMessage: string
): Promise<void> {
  const apiError = await parseApiErrorAsync(error);
  toast.error(apiError.suggestion || apiError.message || fallbackMessage);
}
