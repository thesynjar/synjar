import { DomainEvent } from '../../shared/domain-event';
import { DocumentPurpose } from '@prisma/client';

/**
 * Domain event emitted when a document's purpose is changed.
 *
 * Purpose changes have critical business implications:
 * - KNOWLEDGE -> INSTRUCTION: Document is removed from semantic search (RAG)
 * - INSTRUCTION -> KNOWLEDGE: Document becomes searchable via RAG
 *
 * This event enables:
 * - Audit trail for compliance
 * - Triggering re-indexing workflows
 * - Notifications to stakeholders
 */
export class DocumentPurposeChangedEvent extends DomainEvent {
  constructor(
    public readonly documentId: string,
    public readonly workspaceId: string,
    public readonly oldPurpose: DocumentPurpose,
    public readonly newPurpose: DocumentPurpose,
    public readonly changedBy: string,
  ) {
    super();
  }

  get eventName(): string {
    return 'document.purpose.changed';
  }
}
