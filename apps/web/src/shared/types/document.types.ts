/**
 * Document Purpose - determines how a document is used in the system.
 *
 * - KNOWLEDGE: Indexed for semantic search (RAG) and available in Instruction Sets
 * - INSTRUCTION: Full context only (not indexed for search), available in Instruction Sets
 */
export type DocumentPurpose = 'KNOWLEDGE' | 'INSTRUCTION';

/**
 * Default document purpose when creating new documents.
 * KNOWLEDGE documents are indexed for semantic search.
 */
export const DEFAULT_DOCUMENT_PURPOSE: DocumentPurpose = 'KNOWLEDGE';
