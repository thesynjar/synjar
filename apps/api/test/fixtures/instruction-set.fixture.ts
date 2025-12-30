import { v4 as uuidv4 } from 'uuid';

export interface InstructionSetFixture {
  id?: string;
  name: string;
  description?: string;
  workspaceId: string;
  isPublic: boolean;
  documents?: InstructionSetDocumentFixture[];
}

export interface InstructionSetDocumentFixture {
  id?: string;
  documentId: string;
  title: string;
  sizeBytes: number;
  order: number;
}

/**
 * Standard instruction set (3 documents, ~13.3 KB)
 */
export function createStandardInstructionSet(workspaceId: string): InstructionSetFixture {
  return {
    id: uuidv4(),
    name: 'Standard Test Set',
    description: 'A standard test instruction set with 3 documents',
    workspaceId,
    isPublic: false,
    documents: [
      { documentId: uuidv4(), title: 'Document 1', sizeBytes: 4000, order: 0 },
      { documentId: uuidv4(), title: 'Document 2', sizeBytes: 5000, order: 1 },
      { documentId: uuidv4(), title: 'Document 3', sizeBytes: 4300, order: 2 },
    ],
  };
}

/**
 * Empty instruction set (0 documents)
 */
export function createEmptyInstructionSet(workspaceId: string): InstructionSetFixture {
  return {
    id: uuidv4(),
    name: 'Empty Test Set',
    description: 'An empty instruction set for testing',
    workspaceId,
    isPublic: false,
    documents: [],
  };
}

/**
 * Near-limit instruction set (99 KB)
 */
export function createNearLimitInstructionSet(workspaceId: string): InstructionSetFixture {
  const documents: InstructionSetDocumentFixture[] = [];
  let totalSize = 0;
  const targetSize = 99 * 1024; // 99 KB
  let order = 0;

  while (totalSize < targetSize && documents.length < 20) {
    const docSize = Math.min(10000, targetSize - totalSize); // Max 10KB per doc
    documents.push({
      documentId: uuidv4(),
      title: `Large Document ${order + 1}`,
      sizeBytes: docSize,
      order,
    });
    totalSize += docSize;
    order++;
  }

  return {
    id: uuidv4(),
    name: 'Near Limit Set',
    description: 'Instruction set near 100 KB limit',
    workspaceId,
    isPublic: false,
    documents,
  };
}

/**
 * Max documents instruction set (20 documents)
 */
export function createMaxDocumentsInstructionSet(workspaceId: string): InstructionSetFixture {
  const documents: InstructionSetDocumentFixture[] = [];
  for (let i = 0; i < 20; i++) {
    documents.push({
      documentId: uuidv4(),
      title: `Document ${i + 1}`,
      sizeBytes: 1000, // Small docs, 1KB each = 20KB total
      order: i,
    });
  }

  return {
    id: uuidv4(),
    name: 'Max Documents Set',
    description: 'Instruction set with maximum 20 documents',
    workspaceId,
    isPublic: false,
    documents,
  };
}

/**
 * Public instruction set for sharing tests
 */
export function createPublicInstructionSet(workspaceId: string): InstructionSetFixture {
  return {
    id: uuidv4(),
    name: 'Public Test Set',
    description: 'A public instruction set for testing public access',
    workspaceId,
    isPublic: true,
    documents: [
      { documentId: uuidv4(), title: 'Public Doc 1', sizeBytes: 2000, order: 0 },
      { documentId: uuidv4(), title: 'Public Doc 2', sizeBytes: 3000, order: 1 },
    ],
  };
}
