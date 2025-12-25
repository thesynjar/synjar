import { DomainEvent } from '../../shared/domain-event';

export class DocumentCreatedEvent extends DomainEvent {
  constructor(
    public readonly documentId: string,
    public readonly workspaceId: string,
    public readonly title: string,
    public readonly contentType: string,
  ) {
    super();
  }

  get eventName(): string {
    return 'document.created';
  }
}
