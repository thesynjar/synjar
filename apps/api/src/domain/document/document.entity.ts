import { VerificationStatus, ProcessingStatus, ContentType } from '@prisma/client';

export interface DocumentProps {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  contentType: ContentType;
  originalFilename?: string | null;
  fileUrl?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  sourceDescription?: string | null;
  verificationStatus: VerificationStatus;
  processingStatus: ProcessingStatus;
  processingError?: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class DocumentEntity {
  private constructor(private props: DocumentProps) {}

  // Factory methods
  static create(props: Omit<DocumentProps, 'id' | 'createdAt' | 'updatedAt' | 'processingStatus' | 'processingError'>): DocumentEntity {
    return new DocumentEntity({
      ...props,
      id: '', // Will be set by repository
      processingStatus: 'PENDING',
      processingError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: DocumentProps): DocumentEntity {
    return new DocumentEntity(props);
  }

  // Getters
  get id(): string { return this.props.id; }
  get workspaceId(): string { return this.props.workspaceId; }
  get title(): string { return this.props.title; }
  get content(): string { return this.props.content; }
  get contentType(): ContentType { return this.props.contentType; }
  get verificationStatus(): VerificationStatus { return this.props.verificationStatus; }
  get processingStatus(): ProcessingStatus { return this.props.processingStatus; }
  get tags(): string[] { return [...this.props.tags]; }
  get isFile(): boolean { return this.props.contentType === 'FILE'; }
  get isVerified(): boolean { return this.props.verificationStatus === 'VERIFIED'; }
  get isProcessed(): boolean { return this.props.processingStatus === 'COMPLETED'; }
  get hasFailed(): boolean { return this.props.processingStatus === 'FAILED'; }

  // Business logic
  verify(): void {
    if (this.props.verificationStatus === 'VERIFIED') {
      throw new Error('Document is already verified');
    }
    this.props.verificationStatus = 'VERIFIED';
    this.props.updatedAt = new Date();
  }

  unverify(): void {
    if (this.props.verificationStatus === 'UNVERIFIED') {
      throw new Error('Document is already unverified');
    }
    this.props.verificationStatus = 'UNVERIFIED';
    this.props.updatedAt = new Date();
  }

  startProcessing(): void {
    if (this.props.processingStatus === 'PROCESSING') {
      throw new Error('Document is already being processed');
    }
    if (this.props.processingStatus === 'COMPLETED') {
      throw new Error('Document has already been processed');
    }
    this.props.processingStatus = 'PROCESSING';
    this.props.processingError = null;
    this.props.updatedAt = new Date();
  }

  completeProcessing(): void {
    if (this.props.processingStatus !== 'PROCESSING') {
      throw new Error('Document is not being processed');
    }
    this.props.processingStatus = 'COMPLETED';
    this.props.updatedAt = new Date();
  }

  failProcessing(error: string): void {
    if (this.props.processingStatus !== 'PROCESSING') {
      throw new Error('Document is not being processed');
    }
    this.props.processingStatus = 'FAILED';
    this.props.processingError = error;
    this.props.updatedAt = new Date();
  }

  updateTitle(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new Error('Title cannot be empty');
    }
    this.props.title = title.trim();
    this.props.updatedAt = new Date();
  }

  updateContent(content: string): void {
    this.props.content = content;
    this.props.updatedAt = new Date();
  }

  addTag(tag: string): void {
    const normalizedTag = this.normalizeTag(tag);
    if (this.props.tags.includes(normalizedTag)) {
      return; // Tag already exists
    }
    this.props.tags.push(normalizedTag);
    this.props.updatedAt = new Date();
  }

  removeTag(tag: string): void {
    const normalizedTag = this.normalizeTag(tag);
    const index = this.props.tags.indexOf(normalizedTag);
    if (index === -1) {
      throw new Error(`Tag "${tag}" not found`);
    }
    this.props.tags.splice(index, 1);
    this.props.updatedAt = new Date();
  }

  setTags(tags: string[]): void {
    this.props.tags = tags.map(t => this.normalizeTag(t));
    this.props.updatedAt = new Date();
  }

  private normalizeTag(tag: string): string {
    return tag.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
  }

  // Validation
  canBeDeleted(): boolean {
    return this.props.processingStatus !== 'PROCESSING';
  }

  // Serialization
  toProps(): DocumentProps {
    return { ...this.props };
  }
}
