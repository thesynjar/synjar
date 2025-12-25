import { DomainEvent } from '../../shared/domain-event';

export class DocumentProcessedEvent extends DomainEvent {
  constructor(
    public readonly documentId: string,
    public readonly workspaceId: string,
    public readonly chunksCount: number,
  ) {
    super();
  }

  get eventName(): string {
    return 'document.processed';
  }
}
