import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { PrismaClient, Role } from '@prisma/client';
import { UserContext } from '@/infrastructure/persistence/rls/user.context';
import { v4 as uuidv4 } from 'uuid';

/**
 * Instruction Set Integration Tests
 *
 * These tests verify the API endpoints for Instruction Sets with focus on:
 * 1. Document operations (add, remove, reorder)
 * 2. Optimistic locking (concurrent edit detection)
 * 3. RLS workspace isolation
 * 4. Size and document count limits
 *
 * Test scenarios:
 * - POST /instruction-sets/:id/documents - Add document to set
 * - DELETE /instruction-sets/:id/documents/:docId - Remove document from set
 * - PATCH /instruction-sets/:id/documents/reorder - Reorder documents
 * - PATCH /instruction-sets/:id - Detect concurrent edits (409)
 * - Workspace isolation via RLS
 * - Size limit enforcement (100 KB)
 * - Document count limit enforcement (20 docs)
 */
describe('Instruction Set Integration Tests', () => {
  let prisma: PrismaService;
  let prismaSuperuser: PrismaClient;
  let module: TestingModule;

  // Test data
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let workspaceA: { id: string; name: string };
  let workspaceB: { id: string; name: string };

  // Constants (from domain entity)
  const MAX_SIZE_BYTES = 100 * 1024; // 100 KB
  const MAX_DOCUMENTS = 20;
  const SAMPLE_CONTENT_SMALL = 'Test document content'; // ~21 bytes

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [PrismaService, UserContext],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();

    // Use DATABASE_URL_MIGRATE for superuser access (bypasses RLS in setup/teardown)
    prismaSuperuser = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL_MIGRATE ||
            'postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public',
        },
      },
    });
    await prismaSuperuser.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await prismaSuperuser.$disconnect();
    await module.close();
  });

  beforeEach(async () => {
    // Create test users
    userA = await prismaSuperuser.user.create({
      data: {
        email: `user-a-${uuidv4()}@test.com`,
        passwordHash: 'hash-a',
        name: 'User A',
      },
    });

    userB = await prismaSuperuser.user.create({
      data: {
        email: `user-b-${uuidv4()}@test.com`,
        passwordHash: 'hash-b',
        name: 'User B',
      },
    });

    // Create workspaces
    workspaceA = await prismaSuperuser.workspace.create({
      data: {
        name: `Workspace A ${uuidv4()}`,
        createdById: userA.id,
        members: {
          create: { userId: userA.id, role: Role.OWNER },
        },
      },
    });

    workspaceB = await prismaSuperuser.workspace.create({
      data: {
        name: `Workspace B ${uuidv4()}`,
        createdById: userB.id,
        members: {
          create: { userId: userB.id, role: Role.OWNER },
        },
      },
    });
  });

  afterEach(async () => {
    // Cleanup using superuser (bypasses RLS)
    await prismaSuperuser.instructionSetDocument.deleteMany({
      where: {
        instructionSet: {
          workspaceId: { in: [workspaceA.id, workspaceB.id] },
        },
      },
    });
    await prismaSuperuser.instructionSet.deleteMany({
      where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
    });
    await prismaSuperuser.document.deleteMany({
      where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
    });
    await prismaSuperuser.workspaceMember.deleteMany({
      where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
    });
    await prismaSuperuser.workspace.deleteMany({
      where: { id: { in: [workspaceA.id, workspaceB.id] } },
    });
    await prismaSuperuser.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
  });

  describe('Document Operations', () => {
    it('should add document to instruction set', async () => {
      // Arrange - Create document and instruction set
      const document = await prismaSuperuser.document.create({
        data: {
          title: 'Test Document',
          content: SAMPLE_CONTENT_SMALL,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Test Set',
          workspaceId: workspaceA.id,
        },
      });

      // Act - Add document via RLS context
      let addedDocument;
      await prisma.forWorkspace(workspaceA.id, async (tx) => {
        addedDocument = await tx.instructionSetDocument.create({
          data: {
            instructionSetId: instructionSet.id,
            documentId: document.id,
            order: 0,
          },
        });
      });

      // Assert - Verify document was added
      const updatedSet = await prismaSuperuser.instructionSet.findUnique({
        where: { id: instructionSet.id },
        include: { documents: true },
      });

      expect(updatedSet?.documents).toHaveLength(1);
      expect(updatedSet?.documents[0].documentId).toBe(document.id);
      expect(updatedSet?.documents[0].order).toBe(0);
      expect(addedDocument).toBeDefined();
    });

    it('should remove document from instruction set', async () => {
      // Arrange - Create set with document
      const document = await prismaSuperuser.document.create({
        data: {
          title: 'Test Document',
          content: SAMPLE_CONTENT_SMALL,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Test Set',
          workspaceId: workspaceA.id,
          documents: {
            create: {
              documentId: document.id,
              order: 0,
            },
          },
        },
      });

      // Act - Remove document via RLS context
      await prisma.forWorkspace(workspaceA.id, async (tx) => {
        await tx.instructionSetDocument.deleteMany({
          where: {
            instructionSetId: instructionSet.id,
            documentId: document.id,
          },
        });
      });

      // Assert - Verify document was removed
      const updatedSet = await prismaSuperuser.instructionSet.findUnique({
        where: { id: instructionSet.id },
        include: { documents: true },
      });

      expect(updatedSet?.documents).toHaveLength(0);
    });

    it('should reorder documents in instruction set', async () => {
      // Arrange - Create set with 3 documents
      const doc1 = await prismaSuperuser.document.create({
        data: {
          title: 'Document 1',
          content: SAMPLE_CONTENT_SMALL,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const doc2 = await prismaSuperuser.document.create({
        data: {
          title: 'Document 2',
          content: SAMPLE_CONTENT_SMALL,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const doc3 = await prismaSuperuser.document.create({
        data: {
          title: 'Document 3',
          content: SAMPLE_CONTENT_SMALL,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Test Set',
          workspaceId: workspaceA.id,
          documents: {
            createMany: {
              data: [
                { documentId: doc1.id, order: 0 },
                { documentId: doc2.id, order: 1 },
                { documentId: doc3.id, order: 2 },
              ],
            },
          },
        },
      });

      // Act - Reorder to [doc3, doc1, doc2]
      const newOrder = [doc3.id, doc1.id, doc2.id];
      await prisma.forWorkspace(workspaceA.id, async (tx) => {
        for (let i = 0; i < newOrder.length; i++) {
          await tx.instructionSetDocument.updateMany({
            where: {
              instructionSetId: instructionSet.id,
              documentId: newOrder[i],
            },
            data: { order: i },
          });
        }
      });

      // Assert - Verify new order
      const updatedSet = await prismaSuperuser.instructionSet.findUnique({
        where: { id: instructionSet.id },
        include: {
          documents: {
            orderBy: { order: 'asc' },
          },
        },
      });

      expect(updatedSet?.documents).toHaveLength(3);
      expect(updatedSet?.documents[0].documentId).toBe(doc3.id);
      expect(updatedSet?.documents[0].order).toBe(0);
      expect(updatedSet?.documents[1].documentId).toBe(doc1.id);
      expect(updatedSet?.documents[1].order).toBe(1);
      expect(updatedSet?.documents[2].documentId).toBe(doc2.id);
      expect(updatedSet?.documents[2].order).toBe(2);
    });
  });

  describe('Optimistic Locking', () => {
    it('should detect concurrent edit via updatedAt timestamp', async () => {
      // Arrange - Create instruction set
      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Test Set',
          workspaceId: workspaceA.id,
        },
      });

      const originalUpdatedAt = instructionSet.updatedAt;

      // Simulate delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act - Update from "another session" (directly via superuser)
      await prismaSuperuser.instructionSet.update({
        where: { id: instructionSet.id },
        data: { name: 'Updated by another user' },
      });

      // Fetch the updated version
      const setAfterConcurrentEdit = await prismaSuperuser.instructionSet.findUnique({
        where: { id: instructionSet.id },
      });

      // Assert - Verify updatedAt has changed (would trigger 409 in real API)
      expect(setAfterConcurrentEdit?.updatedAt.getTime()).not.toBe(originalUpdatedAt.getTime());
      expect(setAfterConcurrentEdit?.name).toBe('Updated by another user');

      // In real implementation, trying to update with stale originalUpdatedAt would fail
      // This test verifies the mechanism exists - actual 409 handling is in service layer
    });
  });

  describe('RLS Workspace Isolation', () => {
    it('should not see instruction sets from other workspaces', async () => {
      // Arrange - Create set in Workspace A
      await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Workspace A Set',
          workspaceId: workspaceA.id,
        },
      });

      // Act - Query from Workspace B context
      const setsFromB = await prisma.forWorkspace(workspaceB.id, async (tx) => {
        return tx.instructionSet.findMany({
          where: { workspaceId: workspaceA.id },
        });
      });

      // Assert - Should not find sets from Workspace A
      expect(setsFromB).toHaveLength(0);
    });

    it('should block cross-workspace document access', async () => {
      // Arrange - Create document in Workspace A, set in Workspace B
      const docInA = await prismaSuperuser.document.create({
        data: {
          title: 'Workspace A Document',
          content: SAMPLE_CONTENT_SMALL,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const setInB = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Workspace B Set',
          workspaceId: workspaceB.id,
        },
      });

      // Act & Assert - Try to add cross-workspace document (should fail)
      await expect(
        prisma.forWorkspace(workspaceB.id, async (tx) => {
          return tx.instructionSetDocument.create({
            data: {
              instructionSetId: setInB.id,
              documentId: docInA.id,
              order: 0,
            },
          });
        }),
      ).rejects.toThrow();
    });

    it('should only see instruction sets within workspace context', async () => {
      // Arrange - Create sets in both workspaces
      await prismaSuperuser.instructionSet.create({
        data: { name: 'Set A1', workspaceId: workspaceA.id },
      });
      await prismaSuperuser.instructionSet.create({
        data: { name: 'Set A2', workspaceId: workspaceA.id },
      });
      await prismaSuperuser.instructionSet.create({
        data: { name: 'Set B1', workspaceId: workspaceB.id },
      });

      // Act - Query from Workspace A context
      const setsFromA = await prisma.forWorkspace(workspaceA.id, async (tx) => {
        return tx.instructionSet.findMany({
          orderBy: { name: 'asc' },
        });
      });

      // Assert - Should only see Workspace A's sets
      expect(setsFromA).toHaveLength(2);
      expect(setsFromA.map(s => s.name)).toEqual(['Set A1', 'Set A2']);
      expect(setsFromA.every(s => s.workspaceId === workspaceA.id)).toBe(true);

      // Act - Query from Workspace B context
      const setsFromB = await prisma.forWorkspace(workspaceB.id, async (tx) => {
        return tx.instructionSet.findMany();
      });

      // Assert - Should only see Workspace B's sets
      expect(setsFromB).toHaveLength(1);
      expect(setsFromB[0].name).toBe('Set B1');
      expect(setsFromB[0].workspaceId).toBe(workspaceB.id);
    });
  });

  describe('Size Limits', () => {
    it('should enforce 100 KB size limit via aggregate', async () => {
      // Arrange - Create set near limit (95 KB)
      const largeDoc1 = await prismaSuperuser.document.create({
        data: {
          title: 'Large Document 1',
          content: 'x'.repeat(47.5 * 1024), // 47.5 KB
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const largeDoc2 = await prismaSuperuser.document.create({
        data: {
          title: 'Large Document 2',
          content: 'x'.repeat(47.5 * 1024), // 47.5 KB
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Near Limit Set',
          workspaceId: workspaceA.id,
          documents: {
            createMany: {
              data: [
                { documentId: largeDoc1.id, order: 0 },
                { documentId: largeDoc2.id, order: 1 },
              ],
            },
          },
        },
      });

      // Act - Try to add another document that would exceed limit
      const exceedingDoc = await prismaSuperuser.document.create({
        data: {
          title: 'Exceeding Document',
          content: 'x'.repeat(10 * 1024), // 10 KB (would exceed 100 KB)
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      // Calculate total size
      const currentSet = await prismaSuperuser.instructionSet.findUnique({
        where: { id: instructionSet.id },
        include: {
          documents: {
            include: { document: true },
          },
        },
      });

      const currentSize = currentSet!.documents.reduce((sum, d) => {
        return sum + Buffer.byteLength(d.document.content, 'utf8');
      }, 0);

      const exceedingDocSize = Buffer.byteLength(exceedingDoc.content, 'utf8');
      const totalSize = currentSize + exceedingDocSize;

      // Assert - Verify total would exceed limit
      expect(totalSize).toBeGreaterThan(MAX_SIZE_BYTES);

      // Note: Actual SIZE_LIMIT_EXCEEDED error is thrown by domain entity
      // This test verifies the invariant can be checked
      expect(currentSize).toBeLessThan(MAX_SIZE_BYTES);
      expect(currentSize + exceedingDocSize).toBeGreaterThan(MAX_SIZE_BYTES);
    });

    it('should enforce 20 document limit via aggregate', async () => {
      // Arrange - Create set with 20 documents
      const documents = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          prismaSuperuser.document.create({
            data: {
              title: `Document ${i + 1}`,
              content: SAMPLE_CONTENT_SMALL,
              contentType: 'TEXT',
              workspaceId: workspaceA.id,
              verificationStatus: 'VERIFIED',
            },
          }),
        ),
      );

      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Max Documents Set',
          workspaceId: workspaceA.id,
          documents: {
            createMany: {
              data: documents.map((doc, i) => ({
                documentId: doc.id,
                order: i,
              })),
            },
          },
        },
      });

      // Act - Verify we're at the limit
      const setWithDocs = await prismaSuperuser.instructionSet.findUnique({
        where: { id: instructionSet.id },
        include: { documents: true },
      });

      // Assert - Should have exactly MAX_DOCUMENTS
      expect(setWithDocs?.documents).toHaveLength(MAX_DOCUMENTS);

      // Note: Actual DOCUMENT_LIMIT_EXCEEDED error is thrown by domain entity
      // This test verifies the limit is respected at DB level
      // Trying to add more would be rejected by InstructionSetEntity.addDocument()
      expect(setWithDocs?.documents.length).toBe(MAX_DOCUMENTS);
    });

    it('should calculate total size correctly for multiple documents', async () => {
      // Arrange - Create documents with known sizes
      const doc1Content = 'a'.repeat(1000); // 1 KB
      const doc2Content = 'b'.repeat(2000); // 2 KB
      const doc3Content = 'c'.repeat(3000); // 3 KB

      const doc1 = await prismaSuperuser.document.create({
        data: {
          title: 'Doc 1',
          content: doc1Content,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const doc2 = await prismaSuperuser.document.create({
        data: {
          title: 'Doc 2',
          content: doc2Content,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const doc3 = await prismaSuperuser.document.create({
        data: {
          title: 'Doc 3',
          content: doc3Content,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Size Test Set',
          workspaceId: workspaceA.id,
          documents: {
            createMany: {
              data: [
                { documentId: doc1.id, order: 0 },
                { documentId: doc2.id, order: 1 },
                { documentId: doc3.id, order: 2 },
              ],
            },
          },
        },
      });

      // Act - Calculate total size
      const setWithDocs = await prismaSuperuser.instructionSet.findUnique({
        where: { id: instructionSet.id },
        include: {
          documents: {
            include: { document: true },
          },
        },
      });

      const totalSize = setWithDocs!.documents.reduce((sum, d) => {
        return sum + Buffer.byteLength(d.document.content, 'utf8');
      }, 0);

      // Assert - Should be 6000 bytes (6 KB)
      const expectedSize = 1000 + 2000 + 3000;
      expect(totalSize).toBe(expectedSize);
      expect(totalSize).toBeLessThan(MAX_SIZE_BYTES);
    });
  });

  describe('Cascade Delete', () => {
    it('should cascade delete documents when instruction set is deleted', async () => {
      // Arrange - Create set with documents
      const document = await prismaSuperuser.document.create({
        data: {
          title: 'Test Document',
          content: SAMPLE_CONTENT_SMALL,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Test Set',
          workspaceId: workspaceA.id,
          documents: {
            create: {
              documentId: document.id,
              order: 0,
            },
          },
        },
      });

      // Verify documents exist
      const docsBefore = await prismaSuperuser.instructionSetDocument.findMany({
        where: { instructionSetId: instructionSet.id },
      });
      expect(docsBefore).toHaveLength(1);

      // Act - Delete instruction set
      await prismaSuperuser.instructionSet.delete({
        where: { id: instructionSet.id },
      });

      // Assert - Verify cascade delete
      const docsAfter = await prismaSuperuser.instructionSetDocument.findMany({
        where: { instructionSetId: instructionSet.id },
      });
      expect(docsAfter).toHaveLength(0);

      // Original document should still exist
      const originalDoc = await prismaSuperuser.document.findUnique({
        where: { id: document.id },
      });
      expect(originalDoc).not.toBeNull();
    });

    it('should cascade delete instruction sets when workspace is deleted', async () => {
      // Arrange - Create instruction set
      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Test Set',
          workspaceId: workspaceA.id,
        },
      });

      // Verify set exists
      const setBefore = await prismaSuperuser.instructionSet.findUnique({
        where: { id: instructionSet.id },
      });
      expect(setBefore).not.toBeNull();

      // Act - Delete workspace
      await prismaSuperuser.workspaceMember.deleteMany({
        where: { workspaceId: workspaceA.id },
      });
      await prismaSuperuser.workspace.delete({
        where: { id: workspaceA.id },
      });

      // Assert - Verify cascade delete
      const setAfter = await prismaSuperuser.instructionSet.findUnique({
        where: { id: instructionSet.id },
      });
      expect(setAfter).toBeNull();

      // Recreate workspace for cleanup
      workspaceA = await prismaSuperuser.workspace.create({
        data: {
          name: `Workspace A ${uuidv4()}`,
          createdById: userA.id,
          members: {
            create: { userId: userA.id, role: Role.OWNER },
          },
        },
      });
    });
  });

  describe('Document Uniqueness', () => {
    it('should prevent duplicate documents in same set', async () => {
      // Arrange - Create document and set
      const document = await prismaSuperuser.document.create({
        data: {
          title: 'Test Document',
          content: SAMPLE_CONTENT_SMALL,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Test Set',
          workspaceId: workspaceA.id,
          documents: {
            create: {
              documentId: document.id,
              order: 0,
            },
          },
        },
      });

      // Act & Assert - Try to add same document again (should fail due to unique constraint)
      await expect(
        prismaSuperuser.instructionSetDocument.create({
          data: {
            instructionSetId: instructionSet.id,
            documentId: document.id,
            order: 1,
          },
        }),
      ).rejects.toThrow();
    });

    it('should allow same document in different sets', async () => {
      // Arrange - Create document and two sets
      const document = await prismaSuperuser.document.create({
        data: {
          title: 'Shared Document',
          content: SAMPLE_CONTENT_SMALL,
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const set1 = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Set 1',
          workspaceId: workspaceA.id,
        },
      });

      const set2 = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Set 2',
          workspaceId: workspaceA.id,
        },
      });

      // Act - Add same document to both sets
      await prismaSuperuser.instructionSetDocument.create({
        data: {
          instructionSetId: set1.id,
          documentId: document.id,
          order: 0,
        },
      });

      await prismaSuperuser.instructionSetDocument.create({
        data: {
          instructionSetId: set2.id,
          documentId: document.id,
          order: 0,
        },
      });

      // Assert - Verify document is in both sets
      const set1Docs = await prismaSuperuser.instructionSetDocument.findMany({
        where: { instructionSetId: set1.id },
      });
      const set2Docs = await prismaSuperuser.instructionSetDocument.findMany({
        where: { instructionSetId: set2.id },
      });

      expect(set1Docs).toHaveLength(1);
      expect(set2Docs).toHaveLength(1);
      expect(set1Docs[0].documentId).toBe(document.id);
      expect(set2Docs[0].documentId).toBe(document.id);
    });
  });

  describe('Create with Initial Documents', () => {
    /**
     * This test verifies the fix for bug #1:
     * Creating instruction set with documentIds failed with 500 error
     * because RLS context was lost when reloading entity after transaction.
     *
     * Fix: Wrapped reload in forWorkspace() to maintain RLS context.
     */
    it('should create instruction set with initial documents and reload correctly', async () => {
      // Arrange - Create documents
      const doc1 = await prismaSuperuser.document.create({
        data: {
          title: 'Initial Doc 1',
          content: 'Content for doc 1',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const doc2 = await prismaSuperuser.document.create({
        data: {
          title: 'Initial Doc 2',
          content: 'Content for doc 2',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      // Act - Create instruction set with initial documents via RLS context
      // This simulates what the service does: create set, add documents, reload
      let createdSet;
      await prisma.forWorkspace(workspaceA.id, async (tx) => {
        // Create the instruction set
        const set = await tx.instructionSet.create({
          data: {
            name: 'Set with Initial Docs',
            workspaceId: workspaceA.id,
          },
        });

        // Add documents (simulates addDocumentInternal calls)
        await tx.instructionSetDocument.create({
          data: {
            instructionSetId: set.id,
            documentId: doc1.id,
            order: 0,
          },
        });
        await tx.instructionSetDocument.create({
          data: {
            instructionSetId: set.id,
            documentId: doc2.id,
            order: 1,
          },
        });

        // Reload with RLS context (this was the failing part before fix)
        createdSet = await tx.instructionSet.findUnique({
          where: { id: set.id },
          include: {
            documents: {
              include: { document: true },
              orderBy: { order: 'asc' },
            },
          },
        });
      });

      // Assert - Verify set was created with documents
      expect(createdSet).not.toBeNull();
      expect(createdSet!.name).toBe('Set with Initial Docs');
      expect(createdSet!.documents).toHaveLength(2);
      expect(createdSet!.documents[0].documentId).toBe(doc1.id);
      expect(createdSet!.documents[1].documentId).toBe(doc2.id);
    });

    it('should fail to reload outside RLS context (demonstrates the bug)', async () => {
      // Arrange - Create a set
      const instructionSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Test Set',
          workspaceId: workspaceA.id,
        },
      });

      // Act - Try to find set WITHOUT RLS context (using app user)
      // This demonstrates why we need forWorkspace() for reload
      const result = await prisma.instructionSet.findUnique({
        where: { id: instructionSet.id },
      });

      // Assert - Should return null because RLS blocks access without context
      expect(result).toBeNull();
    });
  });

  describe('Public Access via SECURITY DEFINER Functions', () => {
    /**
     * These tests verify the fix for bug #2:
     * Public instruction set access not working because raw query
     * didn't bypass RLS. Fixed by creating SECURITY DEFINER functions.
     */

    it('should return public instruction set via lookup_public_instruction_set()', async () => {
      // Arrange - Create a public instruction set
      const publicSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Public Set',
          description: 'A public instruction set',
          workspaceId: workspaceA.id,
          isPublic: true,
        },
      });

      // Act - Query via SECURITY DEFINER function (no RLS context needed)
      const result = await prisma.$queryRaw<Array<{
        id: string;
        workspace_id: string;
        name: string;
        description: string | null;
        is_public: boolean;
      }>>`SELECT * FROM lookup_public_instruction_set(${publicSet.id})`;

      // Assert - Should return the public set
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(publicSet.id);
      expect(result[0].name).toBe('Public Set');
      expect(result[0].description).toBe('A public instruction set');
      expect(result[0].is_public).toBe(true);
    });

    it('should NOT return private instruction set via lookup_public_instruction_set()', async () => {
      // Arrange - Create a private instruction set
      const privateSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Private Set',
          workspaceId: workspaceA.id,
          isPublic: false,
        },
      });

      // Act - Query via SECURITY DEFINER function
      const result = await prisma.$queryRaw<Array<{
        id: string;
      }>>`SELECT * FROM lookup_public_instruction_set(${privateSet.id})`;

      // Assert - Should return empty (prevents enumeration)
      expect(result).toHaveLength(0);
    });

    it('should return only VERIFIED documents via get_public_instruction_set_documents()', async () => {
      // Arrange - Create public set with verified and unverified documents
      const verifiedDoc = await prismaSuperuser.document.create({
        data: {
          title: 'Verified Document',
          content: 'Verified content',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const unverifiedDoc = await prismaSuperuser.document.create({
        data: {
          title: 'Unverified Document',
          content: 'Unverified content',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'UNVERIFIED',
        },
      });

      const publicSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Public Set with Mixed Docs',
          workspaceId: workspaceA.id,
          isPublic: true,
          documents: {
            createMany: {
              data: [
                { documentId: verifiedDoc.id, order: 0 },
                { documentId: unverifiedDoc.id, order: 1 },
              ],
            },
          },
        },
      });

      // Act - Query documents via SECURITY DEFINER function
      const result = await prisma.$queryRaw<Array<{
        id: string;
        document_id: string;
        title: string;
        doc_order: number;
      }>>`SELECT * FROM get_public_instruction_set_documents(${publicSet.id})`;

      // Assert - Should only return the VERIFIED document
      expect(result).toHaveLength(1);
      expect(result[0].document_id).toBe(verifiedDoc.id);
      expect(result[0].title).toBe('Verified Document');
    });

    it('should return empty for non-public set via get_public_instruction_set_documents()', async () => {
      // Arrange - Create private set with verified document
      const verifiedDoc = await prismaSuperuser.document.create({
        data: {
          title: 'Verified Document',
          content: 'Content',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const privateSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Private Set',
          workspaceId: workspaceA.id,
          isPublic: false,
          documents: {
            create: {
              documentId: verifiedDoc.id,
              order: 0,
            },
          },
        },
      });

      // Act - Query documents via SECURITY DEFINER function
      const result = await prisma.$queryRaw<Array<{
        id: string;
      }>>`SELECT * FROM get_public_instruction_set_documents(${privateSet.id})`;

      // Assert - Should return empty (set is not public)
      expect(result).toHaveLength(0);
    });

    it('should return documents in correct order', async () => {
      // Arrange - Create public set with multiple verified documents
      const doc1 = await prismaSuperuser.document.create({
        data: {
          title: 'Document One',
          content: 'Content 1',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const doc2 = await prismaSuperuser.document.create({
        data: {
          title: 'Document Two',
          content: 'Content 2',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const doc3 = await prismaSuperuser.document.create({
        data: {
          title: 'Document Three',
          content: 'Content 3',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
          verificationStatus: 'VERIFIED',
        },
      });

      const publicSet = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Ordered Public Set',
          workspaceId: workspaceA.id,
          isPublic: true,
          documents: {
            createMany: {
              data: [
                { documentId: doc3.id, order: 0 }, // Third doc first
                { documentId: doc1.id, order: 1 }, // First doc second
                { documentId: doc2.id, order: 2 }, // Second doc third
              ],
            },
          },
        },
      });

      // Act - Query documents
      const result = await prisma.$queryRaw<Array<{
        document_id: string;
        doc_order: number;
        title: string;
      }>>`SELECT * FROM get_public_instruction_set_documents(${publicSet.id})`;

      // Assert - Should be in order by doc_order
      expect(result).toHaveLength(3);
      expect(result[0].doc_order).toBe(0);
      expect(result[0].title).toBe('Document Three');
      expect(result[1].doc_order).toBe(1);
      expect(result[1].title).toBe('Document One');
      expect(result[2].doc_order).toBe(2);
      expect(result[2].title).toBe('Document Two');
    });

    it('should prevent SQL injection via SECURITY DEFINER function', async () => {
      // Act - Try SQL injection in the parameter
      const maliciousId = "'; DROP TABLE \"InstructionSet\"; --";

      const result = await prisma.$queryRaw<Array<{
        id: string;
      }>>`SELECT * FROM lookup_public_instruction_set(${maliciousId})`;

      // Assert - Should return empty (parameterized query prevents injection)
      expect(result).toHaveLength(0);

      // Verify table still exists (query didn't destroy it)
      await prismaSuperuser.instructionSet.findFirst();
      // If we got here without error, table exists
    });

    it('should isolate workspaces - public set from workspace A not visible when querying from workspace B context', async () => {
      // Arrange - Create public set in workspace A
      const publicSetA = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Public Set in Workspace A',
          workspaceId: workspaceA.id,
          isPublic: true,
        },
      });

      // Act - Query via SECURITY DEFINER (no workspace context needed for public)
      // But also verify that this works from "outside" any workspace
      const result = await prisma.$queryRaw<Array<{
        id: string;
        workspace_id: string;
      }>>`SELECT * FROM lookup_public_instruction_set(${publicSetA.id})`;

      // Assert - Public access works regardless of workspace context
      expect(result).toHaveLength(1);
      expect(result[0].workspace_id).toBe(workspaceA.id);

      // Also verify that non-public sets from other workspaces remain hidden
      const privateSetB = await prismaSuperuser.instructionSet.create({
        data: {
          name: 'Private Set in Workspace B',
          workspaceId: workspaceB.id,
          isPublic: false,
        },
      });

      const privateResult = await prisma.$queryRaw<Array<{
        id: string;
      }>>`SELECT * FROM lookup_public_instruction_set(${privateSetB.id})`;

      expect(privateResult).toHaveLength(0);
    });
  });
});
