import DOMPurify from 'dompurify';

/**
 * Sanitizes text input to prevent XSS attacks.
 * Uses DOMPurify to strip any HTML/script content.
 *
 * @param input - The text to sanitize
 * @returns Sanitized text with HTML stripped
 */
export function sanitizeText(input: string): string {
  // DOMPurify with ALLOWED_TAGS=[] strips all HTML
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}
