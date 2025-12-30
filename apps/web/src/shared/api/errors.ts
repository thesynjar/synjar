export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
    public suggestion?: string
  ) {
    super(message);
  }
}

export function parseApiError(error: unknown): ApiError {
  // Parse structured error from response
  if (error && typeof error === 'object' && 'error' in error) {
    const e = (error as any).error;
    return new ApiError(e.code, e.message, e.details, e.suggestion);
  }
  // Handle HTTPError from ky
  if (error && typeof error === 'object' && 'response' in error) {
    // Note: This is sync, so we can't parse response body here
    // Use parseApiErrorAsync for HTTPError
  }
  return new ApiError('UNKNOWN_ERROR', 'An unexpected error occurred');
}

// Async version for ky HTTPError
export async function parseApiErrorAsync(error: unknown): Promise<ApiError> {
  if (error && typeof error === 'object' && 'response' in error) {
    try {
      const httpError = error as any;
      const body = await httpError.response.json();
      if (body.error) {
        return new ApiError(body.error.code, body.error.message, body.error.details, body.error.suggestion);
      }
    } catch {
      // Couldn't parse response
    }
  }
  return parseApiError(error);
}

// Type guard for checking error codes
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// Common error codes
export const API_ERROR_CODES = {
  CONFLICT: 'CONFLICT',
  SIZE_LIMIT_EXCEEDED: 'SIZE_LIMIT_EXCEEDED',
  DOCUMENT_LIMIT_EXCEEDED: 'DOCUMENT_LIMIT_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;
