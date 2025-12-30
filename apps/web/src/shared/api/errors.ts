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

interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  suggestion?: string;
}

interface ApiErrorResponse {
  error: ApiErrorBody;
}

interface HTTPErrorLike {
  response: {
    json(): Promise<unknown>;
  };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    value !== null &&
    typeof value === 'object' &&
    'code' in value &&
    'message' in value &&
    typeof (value as ApiErrorBody).code === 'string' &&
    typeof (value as ApiErrorBody).message === 'string'
  );
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    value !== null &&
    typeof value === 'object' &&
    'error' in value &&
    isApiErrorBody((value as ApiErrorResponse).error)
  );
}

function isHTTPErrorLike(error: unknown): error is HTTPErrorLike {
  return (
    error !== null &&
    typeof error === 'object' &&
    'response' in error &&
    typeof (error as HTTPErrorLike).response === 'object' &&
    (error as HTTPErrorLike).response !== null &&
    typeof (error as HTTPErrorLike).response.json === 'function'
  );
}

export function parseApiError(error: unknown): ApiError {
  // Parse structured error from response
  if (isApiErrorResponse(error)) {
    const e = error.error;
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
  if (isHTTPErrorLike(error)) {
    try {
      const body = await error.response.json();
      // Handle direct error format { code, message, ... }
      if (isApiErrorBody(body)) {
        return new ApiError(body.code, body.message, body.details, body.suggestion);
      }
      // Handle wrapped error format { error: { code, message, ... } }
      if (isApiErrorResponse(body)) {
        return new ApiError(
          body.error.code,
          body.error.message,
          body.error.details,
          body.error.suggestion,
        );
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
