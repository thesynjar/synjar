/**
 * Domain errors for Instruction Sets
 */

export class InstructionSetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = 'InstructionSetError';
  }
}

export class SizeLimitExceededError extends InstructionSetError {
  constructor(currentSizeBytes: number, documentSizeBytes: number, limitBytes: number) {
    super(
      'SIZE_LIMIT_EXCEEDED',
      'Adding this document would exceed the 100 KB limit',
      { currentSizeBytes, documentSizeBytes, limitBytes },
      'Remove unused documents or choose a smaller file',
    );
  }
}

export class DocumentLimitExceededError extends InstructionSetError {
  constructor(currentCount: number, limit: number) {
    super(
      'DOCUMENT_LIMIT_EXCEEDED',
      `Instruction set has reached the limit of ${limit} documents`,
      { currentCount, limit },
      'Remove unused documents before adding new ones',
    );
  }
}

export class WorkspaceLimitExceededError extends InstructionSetError {
  constructor(currentCount: number, limit: number) {
    super(
      'WORKSPACE_LIMIT_EXCEEDED',
      `Workspace has reached the limit of ${limit} instruction sets`,
      { currentCount, limit },
      'Remove unused instruction sets before creating new ones',
    );
  }
}

export class DocumentAlreadyInSetError extends InstructionSetError {
  constructor(documentId: string) {
    super(
      'DOCUMENT_ALREADY_IN_SET',
      'This document is already in the set',
      { documentId },
      'The document cannot be added twice to the same set',
    );
  }
}

export class DocumentNotInSetError extends InstructionSetError {
  constructor(documentId: string) {
    super(
      'DOCUMENT_NOT_IN_SET',
      'This document is not in the set',
      { documentId },
    );
  }
}

export class InvalidInstructionSetNameError extends InstructionSetError {
  constructor() {
    super(
      'VALIDATION_ERROR',
      'Instruction set name is required',
      {},
      'Please provide a name for the instruction set',
    );
  }
}

export class InstructionSetNotFoundError extends InstructionSetError {
  constructor(id: string) {
    super(
      'NOT_FOUND',
      'Instruction set not found',
      { id },
    );
  }
}
