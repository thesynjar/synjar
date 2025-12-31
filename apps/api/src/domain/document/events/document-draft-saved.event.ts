import { DomainEvent } from '../../shared/domain-event';

/**
 * Emitted when a document draft is saved (not published).
 * Draft content is isolated from RAG search and InstructionSets.
 */
export class DocumentDraftSavedEvent extends DomainEvent {
  constructor(
    public readonly documentId: string,
    public readonly workspaceId: string,
    public readonly savedAt: Date,
    public readonly titleLength: number,
    public readonly contentLength: number,
    public readonly savedBy: string,
  ) {
    super();
  }

  get eventName(): string {
    return 'document.draft-saved';
  }
}
