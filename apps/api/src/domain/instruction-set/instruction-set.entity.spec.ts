import { InstructionSetEntity, MAX_DOCUMENTS } from './instruction-set.entity';
import {
  DocumentAlreadyInSetError,
  DocumentLimitExceededError,
  DocumentNotInSetError,
  InvalidInstructionSetNameError,
  SizeLimitExceededError,
} from './errors';

describe('InstructionSetEntity', () => {
  const workspaceId = 'workspace-123';

  describe('create', () => {
    it('should create instruction set with valid name', () => {
      const set = InstructionSetEntity.create({
        workspaceId,
        name: 'Brand Voice',
      });

      expect(set.name).toBe('Brand Voice');
      expect(set.workspaceId).toBe(workspaceId);
      expect(set.documentCount).toBe(0);
      expect(set.isPublic).toBe(false);
      expect(set.description).toBeNull();
    });

    it('should create instruction set with description', () => {
      const set = InstructionSetEntity.create({
        workspaceId,
        name: 'Brand Voice',
        description: 'Official brand communication guidelines',
      });

      expect(set.description).toBe('Official brand communication guidelines');
    });

    it('should trim whitespace from name', () => {
      const set = InstructionSetEntity.create({
        workspaceId,
        name: '  Brand Voice  ',
      });

      expect(set.name).toBe('Brand Voice');
    });

    it('should reject empty name', () => {
      expect(() =>
        InstructionSetEntity.create({
          workspaceId,
          name: '',
        }),
      ).toThrow(InvalidInstructionSetNameError);
    });

    it('should reject whitespace-only name', () => {
      expect(() =>
        InstructionSetEntity.create({
          workspaceId,
          name: '   ',
        }),
      ).toThrow(InvalidInstructionSetNameError);
    });
  });

  describe('addDocument', () => {
    it('should add document to set', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      const doc = set.addDocument({
        documentId: 'doc-1',
        title: 'Tone of Voice',
        content: 'Use friendly, professional tone...',
        sizeBytes: 5000,
      });

      expect(set.documentCount).toBe(1);
      expect(doc.documentId).toBe('doc-1');
      expect(doc.order).toBe(0);
      expect(set.totalSizeBytes).toBe(5000);
    });

    it('should add multiple documents with correct order', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      set.addDocument({ documentId: 'doc-1', title: 'Doc 1', content: 'Content 1', sizeBytes: 1000 });
      set.addDocument({ documentId: 'doc-2', title: 'Doc 2', content: 'Content 2', sizeBytes: 2000 });
      set.addDocument({ documentId: 'doc-3', title: 'Doc 3', content: 'Content 3', sizeBytes: 3000 });

      expect(set.documentCount).toBe(3);
      expect(set.documents[0].order).toBe(0);
      expect(set.documents[1].order).toBe(1);
      expect(set.documents[2].order).toBe(2);
      expect(set.totalSizeBytes).toBe(6000);
    });

    it('should reject adding document that exceeds size limit', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      // Add a document that's almost at the limit
      set.addDocument({
        documentId: 'doc-1',
        title: 'Large Doc',
        content: 'x'.repeat(98000),
        sizeBytes: 98000,
      });

      // Try to add another document that would exceed the limit
      expect(() =>
        set.addDocument({
          documentId: 'doc-2',
          title: 'Another Doc',
          content: 'More content',
          sizeBytes: 5000,
        }),
      ).toThrow(SizeLimitExceededError);

      expect(set.documentCount).toBe(1);
    });

    it('should reject adding more than 20 documents', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      // Add 20 documents
      for (let i = 0; i < MAX_DOCUMENTS; i++) {
        set.addDocument({
          documentId: `doc-${i}`,
          title: `Doc ${i}`,
          content: 'Content',
          sizeBytes: 100,
        });
      }

      expect(set.documentCount).toBe(20);

      // Try to add 21st document
      expect(() =>
        set.addDocument({
          documentId: 'doc-extra',
          title: 'Extra Doc',
          content: 'Content',
          sizeBytes: 100,
        }),
      ).toThrow(DocumentLimitExceededError);
    });

    it('should reject adding duplicate document', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      set.addDocument({
        documentId: 'doc-1',
        title: 'Doc 1',
        content: 'Content',
        sizeBytes: 1000,
      });

      expect(() =>
        set.addDocument({
          documentId: 'doc-1',
          title: 'Doc 1 Again',
          content: 'Content',
          sizeBytes: 1000,
        }),
      ).toThrow(DocumentAlreadyInSetError);
    });
  });

  describe('removeDocument', () => {
    it('should remove document from set', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      set.addDocument({ documentId: 'doc-1', title: 'Doc 1', content: 'Content', sizeBytes: 1000 });
      set.addDocument({ documentId: 'doc-2', title: 'Doc 2', content: 'Content', sizeBytes: 2000 });

      set.removeDocument('doc-1');

      expect(set.documentCount).toBe(1);
      expect(set.hasDocument('doc-1')).toBe(false);
      expect(set.hasDocument('doc-2')).toBe(true);
    });

    it('should re-order remaining documents after removal', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      set.addDocument({ documentId: 'doc-A', title: 'A', content: 'A', sizeBytes: 100 });
      set.addDocument({ documentId: 'doc-B', title: 'B', content: 'B', sizeBytes: 100 });
      set.addDocument({ documentId: 'doc-C', title: 'C', content: 'C', sizeBytes: 100 });

      set.removeDocument('doc-A');

      expect(set.documents[0].documentId).toBe('doc-B');
      expect(set.documents[0].order).toBe(0);
      expect(set.documents[1].documentId).toBe('doc-C');
      expect(set.documents[1].order).toBe(1);
    });

    it('should throw error when removing non-existent document', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      expect(() => set.removeDocument('non-existent')).toThrow(DocumentNotInSetError);
    });
  });

  describe('reorderDocuments', () => {
    it('should reorder documents', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      set.addDocument({ documentId: 'doc-A', title: 'A', content: 'A', sizeBytes: 100 });
      set.addDocument({ documentId: 'doc-B', title: 'B', content: 'B', sizeBytes: 100 });
      set.addDocument({ documentId: 'doc-C', title: 'C', content: 'C', sizeBytes: 100 });

      set.reorderDocuments(['doc-C', 'doc-A', 'doc-B']);

      expect(set.documents[0].documentId).toBe('doc-C');
      expect(set.documents[0].order).toBe(0);
      expect(set.documents[1].documentId).toBe('doc-A');
      expect(set.documents[1].order).toBe(1);
      expect(set.documents[2].documentId).toBe('doc-B');
      expect(set.documents[2].order).toBe(2);
    });

    it('should throw error when document ID not in set', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      set.addDocument({ documentId: 'doc-A', title: 'A', content: 'A', sizeBytes: 100 });

      expect(() => set.reorderDocuments(['doc-A', 'doc-X'])).toThrow(DocumentNotInSetError);
    });

    it('should throw error when not all documents included', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      set.addDocument({ documentId: 'doc-A', title: 'A', content: 'A', sizeBytes: 100 });
      set.addDocument({ documentId: 'doc-B', title: 'B', content: 'B', sizeBytes: 100 });

      expect(() => set.reorderDocuments(['doc-A'])).toThrow('Document IDs must include all documents in the set');
    });
  });

  describe('sizeStatus', () => {
    it('should return ok for 0-60%', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      // 60KB = 60% of 100KB limit
      set.addDocument({ documentId: 'doc-1', title: 'Doc', content: 'x', sizeBytes: 60000 });

      expect(set.sizeStatus).toBe('ok');
    });

    it('should return warning for 60-80%', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      // 70KB = 70% of 100KB limit
      set.addDocument({ documentId: 'doc-1', title: 'Doc', content: 'x', sizeBytes: 70000 });

      expect(set.sizeStatus).toBe('warning');
    });

    it('should return near_limit for 80-95%', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      // 90KB = 90% of 100KB limit
      set.addDocument({ documentId: 'doc-1', title: 'Doc', content: 'x', sizeBytes: 90000 });

      expect(set.sizeStatus).toBe('near_limit');
    });
  });

  describe('canAddDocument', () => {
    it('should return true when within limits', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      expect(set.canAddDocument(5000)).toBe(true);
    });

    it('should return false when would exceed size limit', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });
      set.addDocument({ documentId: 'doc-1', title: 'Doc', content: 'x', sizeBytes: 98000 });

      expect(set.canAddDocument(5000)).toBe(false);
    });

    it('should return false when at document limit', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      for (let i = 0; i < MAX_DOCUMENTS; i++) {
        set.addDocument({ documentId: `doc-${i}`, title: `Doc ${i}`, content: 'x', sizeBytes: 100 });
      }

      expect(set.canAddDocument(100)).toBe(false);
    });
  });

  describe('public access', () => {
    it('should toggle public status', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      expect(set.isPublic).toBe(false);

      set.makePublic();
      expect(set.isPublic).toBe(true);

      set.makePrivate();
      expect(set.isPublic).toBe(false);
    });
  });

  describe('getCombinedContent', () => {
    it('should return combined content with source links', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      set.addDocument({
        documentId: 'doc-1',
        title: 'Tone of Voice',
        content: 'Use friendly tone...',
        sizeBytes: 100,
        fileUrl: 'https://storage.synjar.com/files/tone.pdf',
      });
      set.addDocument({
        documentId: 'doc-2',
        title: 'Brand Guidelines',
        content: 'Colors: #FF5733...',
        sizeBytes: 100,
        fileUrl: null,
      });

      const content = set.getCombinedContent();

      expect(content).toContain('# Tone of Voice');
      expect(content).toContain('Use friendly tone...');
      expect(content).toContain('[Source: https://storage.synjar.com/files/tone.pdf]');
      expect(content).toContain('---');
      expect(content).toContain('# Brand Guidelines');
    });
  });

  describe('tokenEstimate', () => {
    it('should estimate tokens based on size', () => {
      const set = InstructionSetEntity.create({ workspaceId, name: 'Test Set' });

      set.addDocument({ documentId: 'doc-1', title: 'Doc', content: 'x', sizeBytes: 4000 });

      // 4000 bytes / 4 = 1000 tokens
      expect(set.tokenEstimate).toBe(1000);
    });
  });
});
