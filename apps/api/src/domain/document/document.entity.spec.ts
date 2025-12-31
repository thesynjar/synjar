import { DocumentEntity, DocumentProps } from './document.entity';
import { DocumentConflictError, InvalidDocumentOperationError } from './errors';
import {
  DocumentDraftSavedEvent,
  DocumentPublishedEvent,
  DocumentDraftDiscardedEvent,
} from './events';

describe('DocumentEntity - Draft/Publish Lifecycle', () => {
  const USER_ID = 'user-123';

  function createPublishedDocument(overrides: Partial<DocumentProps> = {}): DocumentEntity {
    const now = new Date('2025-12-30T10:00:00Z');
    return DocumentEntity.reconstitute({
      id: 'doc-123',
      workspaceId: 'ws-123',
      title: 'Original Title',
      content: 'Original content',
      contentType: 'TEXT',
      verificationStatus: 'VERIFIED',
      processingStatus: 'COMPLETED',
      tags: [],
      draftTitle: null,
      draftContent: null,
      draftUpdatedAt: null,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
  }

  function createDocumentWithDraft(overrides: Partial<DocumentProps> = {}): DocumentEntity {
    const now = new Date('2025-12-30T10:00:00Z');
    return DocumentEntity.reconstitute({
      id: 'doc-123',
      workspaceId: 'ws-123',
      title: 'Original Title',
      content: 'Original content',
      contentType: 'TEXT',
      verificationStatus: 'VERIFIED',
      processingStatus: 'COMPLETED',
      tags: [],
      draftTitle: 'Draft Title',
      draftContent: 'Draft content',
      draftUpdatedAt: now,
      publishedAt: new Date('2025-12-30T09:00:00Z'),
      createdAt: new Date('2025-12-30T08:00:00Z'),
      updatedAt: now,
      ...overrides,
    });
  }

  describe('saveDraft', () => {
    it('should save draft with title and content', () => {
      // GIVEN a published document
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createPublishedDocument({ updatedAt });

      // WHEN saveDraft is called
      const event = doc.saveDraft('New Title', 'New content', updatedAt, USER_ID);

      // THEN draftTitle should be "New Title"
      expect(doc.draftTitle).toBe('New Title');
      // AND draftContent should be "New content"
      expect(doc.draftContent).toBe('New content');
      // AND draftUpdatedAt should be set to now
      expect(doc.draftUpdatedAt).toBeDefined();
      expect(doc.draftUpdatedAt).toBeInstanceOf(Date);
      // AND hasDraft should return true
      expect(doc.hasDraft).toBe(true);
      // AND DocumentDraftSavedEvent should be returned with correct payload
      expect(event).toBeInstanceOf(DocumentDraftSavedEvent);
      expect(event.documentId).toBe('doc-123');
      expect(event.workspaceId).toBe('ws-123');
      expect(event.titleLength).toBe('New Title'.length);
      expect(event.contentLength).toBe('New content'.length);
      expect(event.savedBy).toBe(USER_ID);
    });

    it('should save draft with only content', () => {
      // GIVEN a published document
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createPublishedDocument({ updatedAt });

      // WHEN saveDraft is called with title=null
      doc.saveDraft(null, 'New content', updatedAt, USER_ID);

      // THEN draftTitle should remain null
      expect(doc.draftTitle).toBe(null);
      // AND draftContent should be "New content"
      expect(doc.draftContent).toBe('New content');
      // AND hasDraft should return true
      expect(doc.hasDraft).toBe(true);
    });

    it('should save draft with only title', () => {
      // GIVEN a published document
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createPublishedDocument({ updatedAt });

      // WHEN saveDraft is called with content=null
      doc.saveDraft('New Title', null, updatedAt, USER_ID);

      // THEN draftTitle should be "New Title"
      expect(doc.draftTitle).toBe('New Title');
      // AND draftContent should remain null
      expect(doc.draftContent).toBe(null);
      // AND hasDraft should return true
      expect(doc.hasDraft).toBe(true);
    });

    it('should throw ConflictError on optimistic lock mismatch', () => {
      // GIVEN a document with updatedAt="2025-12-30T10:00:00Z"
      const doc = createPublishedDocument({
        updatedAt: new Date('2025-12-30T10:00:00Z'),
      });

      // WHEN saveDraft is called with expectedUpdatedAt="2025-12-30T09:00:00Z"
      const staleUpdatedAt = new Date('2025-12-30T09:00:00Z');

      // THEN ConflictError should be thrown
      expect(() => {
        doc.saveDraft('New Title', 'New content', staleUpdatedAt, USER_ID);
      }).toThrow(DocumentConflictError);
    });

    it('should collect domain event', () => {
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createPublishedDocument({ updatedAt });

      doc.saveDraft('New Title', 'New content', updatedAt, USER_ID);

      expect(doc.domainEvents).toHaveLength(1);
      expect(doc.domainEvents[0]).toBeInstanceOf(DocumentDraftSavedEvent);
    });
  });

  describe('publish', () => {
    it('should publish draft and copy to published fields', () => {
      // GIVEN a document with draftTitle="Draft" and draftContent="Draft content"
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createDocumentWithDraft({ updatedAt });

      // WHEN publish is called
      const event = doc.publish(updatedAt, USER_ID);

      // THEN title should be "Draft Title"
      expect(doc.title).toBe('Draft Title');
      // AND content should be "Draft content"
      expect(doc.content).toBe('Draft content');
      // AND draftTitle should be null
      expect(doc.draftTitle).toBe(null);
      // AND draftContent should be null
      expect(doc.draftContent).toBe(null);
      // AND draftUpdatedAt should be null
      expect(doc.draftUpdatedAt).toBe(null);
      // AND publishedAt should be set to now
      expect(doc.publishedAt).toBeDefined();
      expect(doc.publishedAt).toBeInstanceOf(Date);
      // AND hasDraft should return false
      expect(doc.hasDraft).toBe(false);
      // AND DocumentPublishedEvent should be returned
      expect(event).toBeInstanceOf(DocumentPublishedEvent);
      expect(event.documentId).toBe('doc-123');
      expect(event.publishedBy).toBe(USER_ID);
    });

    it('should trigger reprocessing when content changed', () => {
      // GIVEN a document with content="Old" and draftContent="New"
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createDocumentWithDraft({
        content: 'Old content',
        draftContent: 'New content',
        processingStatus: 'COMPLETED',
        updatedAt,
      });

      // WHEN publish is called
      const event = doc.publish(updatedAt, USER_ID);

      // THEN processingStatus should be PENDING
      expect(doc.processingStatus).toBe('PENDING');
      // AND event.requiresReprocessing should be true
      expect(event.requiresReprocessing).toBe(true);
      expect(event.contentChanged).toBe(true);
    });

    it('should NOT trigger reprocessing when content unchanged', () => {
      // GIVEN a document with content="Same" and draftContent="Same" and draftTitle="New Title"
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createDocumentWithDraft({
        content: 'Same content',
        draftContent: 'Same content',
        draftTitle: 'New Title',
        processingStatus: 'COMPLETED',
        updatedAt,
      });

      // WHEN publish is called
      const event = doc.publish(updatedAt, USER_ID);

      // THEN processingStatus should remain unchanged (COMPLETED)
      expect(doc.processingStatus).toBe('COMPLETED');
      // AND event.requiresReprocessing should be false
      expect(event.requiresReprocessing).toBe(false);
      // AND event.titleChanged should be true
      expect(event.titleChanged).toBe(true);
      expect(event.contentChanged).toBe(false);
    });

    it('should throw InvalidOperationError when no draft exists', () => {
      // GIVEN a document without draft
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createPublishedDocument({ updatedAt });

      // WHEN publish is called
      // THEN InvalidOperationError should be thrown
      expect(() => {
        doc.publish(updatedAt, USER_ID);
      }).toThrow(InvalidDocumentOperationError);

      expect(() => {
        doc.publish(updatedAt, USER_ID);
      }).toThrow('No draft to publish');
    });

    it('should throw ConflictError on optimistic lock mismatch', () => {
      // GIVEN a document with draft
      const doc = createDocumentWithDraft({
        updatedAt: new Date('2025-12-30T10:00:00Z'),
      });

      // WHEN publish is called with stale expectedUpdatedAt
      const staleUpdatedAt = new Date('2025-12-30T09:00:00Z');

      // THEN ConflictError should be thrown
      expect(() => {
        doc.publish(staleUpdatedAt, USER_ID);
      }).toThrow(DocumentConflictError);
    });

    it('should collect domain event', () => {
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createDocumentWithDraft({ updatedAt });

      doc.publish(updatedAt, USER_ID);

      expect(doc.domainEvents).toHaveLength(1);
      expect(doc.domainEvents[0]).toBeInstanceOf(DocumentPublishedEvent);
    });
  });

  describe('discardDraft', () => {
    it('should discard draft and clear draft fields', () => {
      // GIVEN a document with draftTitle="Draft" and draftContent="Draft content"
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createDocumentWithDraft({ updatedAt });

      // WHEN discardDraft is called
      const event = doc.discardDraft(updatedAt, USER_ID);

      // THEN draftTitle should be null
      expect(doc.draftTitle).toBe(null);
      // AND draftContent should be null
      expect(doc.draftContent).toBe(null);
      // AND draftUpdatedAt should be null
      expect(doc.draftUpdatedAt).toBe(null);
      // AND title should remain "Original Title"
      expect(doc.title).toBe('Original Title');
      // AND content should remain "Original content"
      expect(doc.content).toBe('Original content');
      // AND hasDraft should return false
      expect(doc.hasDraft).toBe(false);
      // AND DocumentDraftDiscardedEvent should be returned
      expect(event).toBeInstanceOf(DocumentDraftDiscardedEvent);
      expect(event.documentId).toBe('doc-123');
      expect(event.hadDraft).toBe(true);
      expect(event.discardedBy).toBe(USER_ID);
    });

    it('should work even when no draft exists', () => {
      // GIVEN a document without draft
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createPublishedDocument({ updatedAt });

      // WHEN discardDraft is called
      const event = doc.discardDraft(updatedAt, USER_ID);

      // THEN event.hadDraft should be false
      expect(event.hadDraft).toBe(false);
      // AND document state remains unchanged
      expect(doc.hasDraft).toBe(false);
    });

    it('should throw ConflictError on optimistic lock mismatch', () => {
      // GIVEN a document with draft
      const doc = createDocumentWithDraft({
        updatedAt: new Date('2025-12-30T10:00:00Z'),
      });

      // WHEN discardDraft is called with stale expectedUpdatedAt
      const staleUpdatedAt = new Date('2025-12-30T09:00:00Z');

      // THEN ConflictError should be thrown
      expect(() => {
        doc.discardDraft(staleUpdatedAt, USER_ID);
      }).toThrow(DocumentConflictError);
    });

    it('should collect domain event', () => {
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createDocumentWithDraft({ updatedAt });

      doc.discardDraft(updatedAt, USER_ID);

      expect(doc.domainEvents).toHaveLength(1);
      expect(doc.domainEvents[0]).toBeInstanceOf(DocumentDraftDiscardedEvent);
    });
  });

  describe('getEditableContent', () => {
    it('should return draft when exists', () => {
      // GIVEN a document with draft
      const doc = createDocumentWithDraft();

      // WHEN getEditableContent is called
      const content = doc.getEditableContent();

      // THEN it should return draft values
      expect(content.title).toBe('Draft Title');
      expect(content.content).toBe('Draft content');
    });

    it('should return published when no draft', () => {
      // GIVEN a document without draft
      const doc = createPublishedDocument();

      // WHEN getEditableContent is called
      const content = doc.getEditableContent();

      // THEN it should return published values
      expect(content.title).toBe('Original Title');
      expect(content.content).toBe('Original content');
    });

    it('should return mix when only partial draft', () => {
      // GIVEN a document with only draftTitle
      const doc = createPublishedDocument({
        draftTitle: 'New Title',
        draftContent: null,
        draftUpdatedAt: new Date(),
      });

      // WHEN getEditableContent is called
      const content = doc.getEditableContent();

      // THEN it should return draft title and published content
      expect(content.title).toBe('New Title');
      expect(content.content).toBe('Original content');
    });
  });

  describe('hasUnpublishedChanges', () => {
    it('should return false when no draft', () => {
      const doc = createPublishedDocument();
      expect(doc.hasUnpublishedChanges()).toBe(false);
    });

    it('should return true when draft differs from published', () => {
      const doc = createDocumentWithDraft();
      expect(doc.hasUnpublishedChanges()).toBe(true);
    });

    it('should return false when draft equals published', () => {
      const doc = createDocumentWithDraft({
        title: 'Same',
        content: 'Same',
        draftTitle: 'Same',
        draftContent: 'Same',
      });
      expect(doc.hasUnpublishedChanges()).toBe(false);
    });
  });

  describe('clearDomainEvents', () => {
    it('should clear collected domain events', () => {
      const updatedAt = new Date('2025-12-30T10:00:00Z');
      const doc = createPublishedDocument({ updatedAt });

      // Save draft to collect an event
      doc.saveDraft('New Title', 'New content', updatedAt, USER_ID);
      expect(doc.domainEvents).toHaveLength(1);

      // Clear events
      doc.clearDomainEvents();
      expect(doc.domainEvents).toHaveLength(0);
    });
  });

  describe('hasDraft getter', () => {
    it('should return true when draftContent exists', () => {
      const doc = createPublishedDocument({
        draftContent: 'Some draft',
        draftTitle: null,
      });
      expect(doc.hasDraft).toBe(true);
    });

    it('should return true when draftTitle exists', () => {
      const doc = createPublishedDocument({
        draftContent: null,
        draftTitle: 'Some title',
      });
      expect(doc.hasDraft).toBe(true);
    });

    it('should return false when both are null', () => {
      const doc = createPublishedDocument({
        draftContent: null,
        draftTitle: null,
      });
      expect(doc.hasDraft).toBe(false);
    });
  });

  describe('factory method create', () => {
    it('should set publishedAt to now for new documents', () => {
      const beforeCreate = new Date();

      const doc = DocumentEntity.create({
        workspaceId: 'ws-123',
        title: 'New Document',
        content: 'Some content',
        contentType: 'TEXT',
        verificationStatus: 'UNVERIFIED',
        tags: [],
      });

      const afterCreate = new Date();

      expect(doc.publishedAt).toBeDefined();
      expect(doc.publishedAt!.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(doc.publishedAt!.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    it('should initialize draft fields as null', () => {
      const doc = DocumentEntity.create({
        workspaceId: 'ws-123',
        title: 'New Document',
        content: 'Some content',
        contentType: 'TEXT',
        verificationStatus: 'UNVERIFIED',
        tags: [],
      });

      expect(doc.draftTitle).toBe(null);
      expect(doc.draftContent).toBe(null);
      expect(doc.draftUpdatedAt).toBe(null);
      expect(doc.hasDraft).toBe(false);
    });
  });
});
