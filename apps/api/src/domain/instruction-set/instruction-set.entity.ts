/**
 * InstructionSet Aggregate - Curated collection of documents for LLM context
 *
 * Invariants:
 * - Max 100 KB total size (~128k tokens)
 * - Max 20 documents
 * - Unique documents (no duplicates)
 */

import { InstructionSetDocumentEntity, InstructionSetDocumentProps } from './instruction-set-document.entity';
import {
  DocumentAlreadyInSetError,
  DocumentLimitExceededError,
  DocumentNotInSetError,
  InvalidInstructionSetNameError,
  SizeLimitExceededError,
} from './errors';

// Limits from specification
export const MAX_SIZE_BYTES = 100 * 1024; // 100 KB
export const MAX_DOCUMENTS = 20;
export const MAX_SETS_PER_WORKSPACE = 50;

// Size status thresholds
export type SizeStatus = 'ok' | 'warning' | 'near_limit' | 'exceeded';

export interface InstructionSetProps {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  documents: InstructionSetDocumentEntity[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentToAdd {
  documentId: string;
  title: string;
  content: string;
  sizeBytes: number;
  fileUrl?: string | null;
}

export class InstructionSetEntity {
  private constructor(private props: InstructionSetProps) {}

  // Factory methods
  static create(props: {
    workspaceId: string;
    name: string;
    description?: string | null;
  }): InstructionSetEntity {
    const trimmedName = props.name?.trim() ?? '';
    if (!trimmedName) {
      throw new InvalidInstructionSetNameError();
    }

    return new InstructionSetEntity({
      id: '', // Will be set by repository
      workspaceId: props.workspaceId,
      name: trimmedName,
      description: props.description ?? null,
      isPublic: false,
      documents: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(
    props: Omit<InstructionSetProps, 'documents'> & { documents: InstructionSetDocumentProps[] },
  ): InstructionSetEntity {
    return new InstructionSetEntity({
      ...props,
      documents: props.documents.map(d => InstructionSetDocumentEntity.reconstitute(d)),
    });
  }

  // Getters
  get id(): string { return this.props.id; }
  get workspaceId(): string { return this.props.workspaceId; }
  get name(): string { return this.props.name; }
  get description(): string | null { return this.props.description; }
  get isPublic(): boolean { return this.props.isPublic; }
  get documents(): InstructionSetDocumentEntity[] { return [...this.props.documents]; }
  get documentCount(): number { return this.props.documents.length; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  get totalSizeBytes(): number {
    return this.props.documents.reduce((sum, doc) => sum + doc.sizeBytes, 0);
  }

  get tokenEstimate(): number {
    // Rough estimate: 1 token ≈ 4 bytes (for English text)
    return Math.round(this.totalSizeBytes / 4);
  }

  get sizeStatus(): SizeStatus {
    const percentage = (this.totalSizeBytes / MAX_SIZE_BYTES) * 100;
    if (percentage > 100) return 'exceeded';
    if (percentage > 80) return 'near_limit';
    if (percentage > 60) return 'warning';
    return 'ok';
  }

  get publicUrl(): string | null {
    if (!this.props.isPublic || !this.props.id) return null;
    // URL will be constructed by the presentation layer
    return `/s/${this.props.id}`;
  }

  // Business logic
  updateName(name: string): void {
    const trimmedName = name?.trim() ?? '';
    if (!trimmedName) {
      throw new InvalidInstructionSetNameError();
    }
    this.props.name = trimmedName;
    this.props.updatedAt = new Date();
  }

  updateDescription(description: string | null): void {
    this.props.description = description;
    this.props.updatedAt = new Date();
  }

  makePublic(): void {
    this.props.isPublic = true;
    this.props.updatedAt = new Date();
  }

  makePrivate(): void {
    this.props.isPublic = false;
    this.props.updatedAt = new Date();
  }

  setPublic(isPublic: boolean): void {
    this.props.isPublic = isPublic;
    this.props.updatedAt = new Date();
  }

  // Document management
  canAddDocument(documentSizeBytes: number): boolean {
    if (this.props.documents.length >= MAX_DOCUMENTS) {
      return false;
    }
    if (this.totalSizeBytes + documentSizeBytes > MAX_SIZE_BYTES) {
      return false;
    }
    return true;
  }

  addDocument(doc: DocumentToAdd): InstructionSetDocumentEntity {
    // Check for duplicate
    if (this.hasDocument(doc.documentId)) {
      throw new DocumentAlreadyInSetError(doc.documentId);
    }

    // Check document limit
    if (this.props.documents.length >= MAX_DOCUMENTS) {
      throw new DocumentLimitExceededError(this.props.documents.length, MAX_DOCUMENTS);
    }

    // Check size limit
    const newTotalSize = this.totalSizeBytes + doc.sizeBytes;
    if (newTotalSize > MAX_SIZE_BYTES) {
      throw new SizeLimitExceededError(this.totalSizeBytes, doc.sizeBytes, MAX_SIZE_BYTES);
    }

    // Add document at the end
    const order = this.props.documents.length;
    const docEntity = InstructionSetDocumentEntity.create({
      instructionSetId: this.props.id,
      documentId: doc.documentId,
      order,
      title: doc.title,
      content: doc.content,
      sizeBytes: doc.sizeBytes,
      fileUrl: doc.fileUrl,
    });

    this.props.documents.push(docEntity);
    this.props.updatedAt = new Date();

    return docEntity;
  }

  removeDocument(documentId: string): void {
    const index = this.props.documents.findIndex(d => d.documentId === documentId);
    if (index === -1) {
      throw new DocumentNotInSetError(documentId);
    }

    this.props.documents.splice(index, 1);

    // Re-order remaining documents
    this.props.documents.forEach((doc, i) => {
      doc.setOrder(i);
    });

    this.props.updatedAt = new Date();
  }

  hasDocument(documentId: string): boolean {
    return this.props.documents.some(d => d.documentId === documentId);
  }

  reorderDocuments(documentIds: string[]): void {
    // Validate all documentIds exist
    const existingIds = new Set(this.props.documents.map(d => d.documentId));
    for (const id of documentIds) {
      if (!existingIds.has(id)) {
        throw new DocumentNotInSetError(id);
      }
    }

    // Validate same count
    if (documentIds.length !== this.props.documents.length) {
      throw new Error('Document IDs must include all documents in the set');
    }

    // Create map for quick lookup
    const docMap = new Map(this.props.documents.map(d => [d.documentId, d]));

    // Reorder
    this.props.documents = documentIds.map((id, order) => {
      const doc = docMap.get(id)!;
      doc.setOrder(order);
      return doc;
    });

    this.props.updatedAt = new Date();
  }

  getDocumentByDocumentId(documentId: string): InstructionSetDocumentEntity | undefined {
    return this.props.documents.find(d => d.documentId === documentId);
  }

  // Get combined content for public view
  getCombinedContent(): string {
    const sortedDocs = [...this.props.documents].sort((a, b) => a.order - b.order);

    return sortedDocs
      .map(doc => {
        let content = `# ${doc.title}\n\n${doc.content}`;
        if (doc.fileUrl) {
          content += `\n\n[Source: ${doc.fileUrl}]`;
        }
        return content;
      })
      .join('\n\n---\n\n');
  }

  // Serialization
  toProps(): InstructionSetProps {
    return {
      ...this.props,
      documents: [...this.props.documents],
    };
  }
}
