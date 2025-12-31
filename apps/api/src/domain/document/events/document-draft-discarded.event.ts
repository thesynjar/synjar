import { DomainEvent } from '../../shared/domain-event';

/**
 * Emitted when a document draft is discarded.
 * Reverts to the published version without any processing.
 */
export class DocumentDraftDiscardedEvent extends DomainEvent {
  constructor(
    public readonly documentId: string,
    public readonly workspaceId: string,
    public readonly discardedAt: Date,
    public readonly hadDraft: boolean,
    public readonly discardedBy: string,
  ) {
    super();
  }

  get eventName(): string {
    return 'document.draft-discarded';
  }
}
