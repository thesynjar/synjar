export const INSTRUCTION_SET_LIMITS = {
  MAX_SIZE_BYTES: 102400, // 100 KB
  MAX_DOCUMENTS: 20,
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 500,
} as const;

/**
 * Edge case: Exactly at size limit (100 KB)
 */
export const exactLimitSize = {
  document: {
    sizeBytes: INSTRUCTION_SET_LIMITS.MAX_SIZE_BYTES,
    title: 'Exactly 100KB Document',
  },
};

/**
 * Edge case: Just over size limit (100 KB + 1 byte)
 */
export const overLimitSize = {
  document: {
    sizeBytes: INSTRUCTION_SET_LIMITS.MAX_SIZE_BYTES + 1,
    title: 'Over Limit Document',
  },
};

/**
 * Edge case: Maximum name length (200 chars)
 */
export const maxNameLength = {
  name: 'A'.repeat(INSTRUCTION_SET_LIMITS.MAX_NAME_LENGTH),
};

/**
 * Edge case: Over name length (201 chars)
 */
export const overNameLength = {
  name: 'A'.repeat(INSTRUCTION_SET_LIMITS.MAX_NAME_LENGTH + 1),
};

/**
 * Edge case: Empty name
 */
export const emptyName = {
  name: '',
};

/**
 * Edge case: Whitespace-only name
 */
export const whitespaceOnlyName = {
  name: '   ',
};
