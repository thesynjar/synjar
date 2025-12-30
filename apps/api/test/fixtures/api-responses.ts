/**
 * Standard API error codes for Instruction Sets
 */
export const InstructionSetErrorCodes = {
  SIZE_LIMIT_EXCEEDED: 'SIZE_LIMIT_EXCEEDED',
  DOCUMENT_LIMIT_EXCEEDED: 'DOCUMENT_LIMIT_EXCEEDED',
  CONFLICT: 'CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
  DOCUMENT_NOT_VERIFIED: 'DOCUMENT_NOT_VERIFIED',
  DOCUMENT_ALREADY_IN_SET: 'DOCUMENT_ALREADY_IN_SET',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type InstructionSetErrorCode = typeof InstructionSetErrorCodes[keyof typeof InstructionSetErrorCodes];

/**
 * Expected error response structure
 */
export interface ApiErrorResponse {
  error: {
    code: InstructionSetErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
  };
}

/**
 * Create SIZE_LIMIT_EXCEEDED error response
 */
export function sizeLimitExceededError(currentSize: number, documentSize: number): ApiErrorResponse {
  return {
    error: {
      code: 'SIZE_LIMIT_EXCEEDED',
      message: 'Adding this document would exceed the 100 KB size limit',
      details: {
        currentSize,
        documentSize,
        limit: 102400,
        wouldBe: currentSize + documentSize,
      },
      suggestion: 'Remove some documents or use smaller documents',
    },
  };
}

/**
 * Create DOCUMENT_LIMIT_EXCEEDED error response
 */
export function documentLimitExceededError(currentCount: number): ApiErrorResponse {
  return {
    error: {
      code: 'DOCUMENT_LIMIT_EXCEEDED',
      message: 'Maximum 20 documents allowed per instruction set',
      details: {
        currentCount,
        limit: 20,
      },
      suggestion: 'Remove some documents before adding new ones',
    },
  };
}

/**
 * Create CONFLICT error response (optimistic locking)
 */
export function conflictError(lastModifiedAt: string): ApiErrorResponse {
  return {
    error: {
      code: 'CONFLICT',
      message: 'This instruction set was modified by another user',
      details: {
        lastModifiedAt,
      },
      suggestion: 'Refresh the page to see the latest changes',
    },
  };
}

/**
 * Create DOCUMENT_NOT_VERIFIED error response
 */
export function documentNotVerifiedError(documentId: string): ApiErrorResponse {
  return {
    error: {
      code: 'DOCUMENT_NOT_VERIFIED',
      message: 'Only verified documents can be added to instruction sets',
      details: {
        documentId,
      },
      suggestion: 'Wait for the document to be verified or verify it manually',
    },
  };
}
