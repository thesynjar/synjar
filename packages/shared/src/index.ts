/**
 * Instruction Set Limits
 *
 * Shared constants for instruction set validation across frontend and backend.
 * These limits ensure consistent behavior and prevent data integrity issues.
 *
 * @see docs/specifications/2025-12-30-20-00-instruction-sets-editor-review-findings.md
 */

export const INSTRUCTION_SET_LIMITS = {
  /** Maximum total size of all documents in a set (100 KB) */
  MAX_SIZE_BYTES: 100 * 1024,

  /** Maximum number of documents per instruction set */
  MAX_DOCUMENTS: 20,

  /** Maximum number of instruction sets per workspace */
  MAX_SETS_PER_WORKSPACE: 50,
} as const;

export type InstructionSetLimits = typeof INSTRUCTION_SET_LIMITS;
