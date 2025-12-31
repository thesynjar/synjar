import { DomainEvent } from '../../shared/domain-event';
import { ProcessingStatus } from '@prisma/client';

/**
 * Emitted when a document draft is published.
 * Triggers processing (chunking/embeddings) if content changed.
 */
export class DocumentPublishedEvent extends DomainEvent {
  constructor(
    public readonly documentId: string,
    public readonly workspaceId: string,
    public readonly publishedAt: Date,
    public readonly previousProcessingStatus: ProcessingStatus,
    public readonly requiresReprocessing: boolean,
    public readonly titleChanged: boolean,
    public readonly contentChanged: boolean,
    public readonly publishedBy: string,
  ) {
    super();
  }

  get eventName(): string {
    return 'document.published';
  }
}
