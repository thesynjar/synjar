import { InstructionSetEntity } from './instruction-set.entity';

export interface CreateInstructionSetData {
  workspaceId: string;
  name: string;
  description?: string | null;
  documentIds?: string[];
}

export interface UpdateInstructionSetData {
  name?: string;
  description?: string | null;
  isPublic?: boolean;
}

export interface InstructionSetWithDocuments {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  documents: Array<{
    id: string;
    instructionSetId: string;
    documentId: string;
    order: number;
    document: {
      id: string;
      title: string;
      content: string;
      fileUrl: string | null;
      verificationStatus: 'VERIFIED' | 'UNVERIFIED';
      purpose: 'KNOWLEDGE' | 'INSTRUCTION';
    };
  }>;
}

export interface IInstructionSetRepository {
  /**
   * Find instruction set by ID with all documents
   */
  findById(id: string): Promise<InstructionSetEntity | null>;

  /**
   * Find instruction set by ID for public access (no RLS)
   * Returns null if not found or not public
   */
  findByIdPublic(id: string): Promise<InstructionSetEntity | null>;

  /**
   * Find all instruction sets in a workspace
   */
  findByWorkspace(workspaceId: string): Promise<InstructionSetEntity[]>;

  /**
   * Count instruction sets in a workspace
   */
  countByWorkspace(workspaceId: string): Promise<number>;

  /**
   * Create a new instruction set
   */
  create(entity: InstructionSetEntity): Promise<InstructionSetEntity>;

  /**
   * Update an existing instruction set
   */
  update(entity: InstructionSetEntity): Promise<InstructionSetEntity>;

  /**
   * Delete an instruction set
   */
  delete(id: string): Promise<void>;

  /**
   * Add a document to an instruction set
   */
  addDocument(instructionSetId: string, documentId: string, order: number): Promise<void>;

  /**
   * Remove a document from an instruction set
   */
  removeDocument(instructionSetId: string, documentId: string): Promise<void>;

  /**
   * Update document orders in an instruction set
   */
  updateDocumentOrders(instructionSetId: string, documentOrders: { documentId: string; order: number }[]): Promise<void>;
}

export const INSTRUCTION_SET_REPOSITORY = Symbol('IInstructionSetRepository');
