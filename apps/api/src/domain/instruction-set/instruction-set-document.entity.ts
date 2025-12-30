/**
 * InstructionSetDocument - Child entity representing a document in an instruction set
 */

export interface InstructionSetDocumentProps {
  id: string;
  instructionSetId: string;
  documentId: string;
  order: number;
  // Document metadata (denormalized for convenience)
  title?: string;
  content?: string;
  sizeBytes?: number;
  fileUrl?: string | null;
}

export class InstructionSetDocumentEntity {
  private constructor(private props: InstructionSetDocumentProps) {}

  static create(props: Omit<InstructionSetDocumentProps, 'id'>): InstructionSetDocumentEntity {
    return new InstructionSetDocumentEntity({
      ...props,
      id: '', // Will be set by repository
    });
  }

  static reconstitute(props: InstructionSetDocumentProps): InstructionSetDocumentEntity {
    return new InstructionSetDocumentEntity(props);
  }

  // Getters
  get id(): string { return this.props.id; }
  get instructionSetId(): string { return this.props.instructionSetId; }
  get documentId(): string { return this.props.documentId; }
  get order(): number { return this.props.order; }
  get title(): string | undefined { return this.props.title; }
  get content(): string | undefined { return this.props.content; }
  get sizeBytes(): number { return this.props.sizeBytes ?? 0; }
  get fileUrl(): string | null | undefined { return this.props.fileUrl; }

  // Business logic
  setOrder(order: number): void {
    if (order < 0) {
      throw new Error('Order must be non-negative');
    }
    this.props.order = order;
  }

  // Serialization
  toProps(): InstructionSetDocumentProps {
    return { ...this.props };
  }
}
