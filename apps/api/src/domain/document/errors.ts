/**
 * Base error for document domain operations.
 */
export class DocumentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

/**
 * Thrown when optimistic locking fails due to concurrent modification.
 * HTTP status: 409 Conflict
 */
export class DocumentConflictError extends DocumentError {
  constructor(
    public readonly documentId: string,
    public readonly currentUpdatedAt: Date,
  ) {
    super(
      `Document was modified by another user. Current updatedAt: ${currentUpdatedAt.toISOString()}`,
      'DOCUMENT_CONFLICT',
    );
    this.name = 'DocumentConflictError';
  }
}

/**
 * Thrown when an operation is invalid for the current document state.
 * HTTP status: 400 Bad Request
 */
export class InvalidDocumentOperationError extends DocumentError {
  constructor(
    message: string,
    public readonly documentId?: string,
  ) {
    super(message, 'INVALID_DOCUMENT_OPERATION');
    this.name = 'InvalidDocumentOperationError';
  }
}

/**
 * Thrown when document is not found.
 * HTTP status: 404 Not Found
 */
export class DocumentNotFoundError extends DocumentError {
  constructor(public readonly documentId: string) {
    super(`Document not found: ${documentId}`, 'DOCUMENT_NOT_FOUND');
    this.name = 'DocumentNotFoundError';
  }
}

/**
 * Thrown when document is locked by another user.
 * HTTP status: 423 Locked
 */
export class DocumentLockedError extends DocumentError {
  constructor(
    public readonly documentId: string,
    public readonly lockedBy: string,
    public readonly lockedUntil: Date,
  ) {
    super(
      `Document is locked by another user until ${lockedUntil.toISOString()}`,
      'DOCUMENT_LOCKED',
    );
    this.name = 'DocumentLockedError';
  }
}
