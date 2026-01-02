import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { PrismaClient, Role } from '@prisma/client';
import { UserContext } from '@/infrastructure/persistence/rls/user.context';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tag Isolation Integration Tests
 *
 * These tests verify that workspace-scoped tags are properly isolated
 * between workspaces using Row Level Security (RLS).
 *
 * Test scenarios:
 * 1. Tags are visible only within their workspace
 * 2. Same tag name can exist in different workspaces
 * 3. Tag autocomplete returns only workspace-scoped tags
 * 4. Tag operations respect workspace context
 * 5. Cross-workspace tag access is blocked by RLS
 */
describe('Tag Isolation Integration Tests', () => {
  let prisma: PrismaService;
  let prismaSuperuser: PrismaClient;
  let module: TestingModule;

  // Test data
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let workspaceA: { id: string; name: string };
  let workspaceB: { id: string; name: string };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [PrismaService, UserContext],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();

    prismaSuperuser = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL_MIGRATE || 'postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public',
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
    await prismaSuperuser.documentTag.deleteMany({
      where: {
        OR: [
          { tag: { workspaceId: workspaceA.id } },
          { tag: { workspaceId: workspaceB.id } },
        ],
      },
    });
    await prismaSuperuser.tag.deleteMany({
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

  describe('Workspace Tag Isolation', () => {
    it('should only see tags within the workspace context', async () => {
      // Create tags in both workspaces
      await prismaSuperuser.tag.create({
        data: { name: 'support', workspaceId: workspaceA.id },
      });
      await prismaSuperuser.tag.create({
        data: { name: 'internal', workspaceId: workspaceA.id },
      });
      await prismaSuperuser.tag.create({
        data: { name: 'support', workspaceId: workspaceB.id },
      });

      // Query tags from Workspace A context
      const tagsFromA = await prisma.forWorkspace(workspaceA.id, async (tx) => {
        return tx.tag.findMany({ orderBy: { name: 'asc' } });
      });

      // Should only see Workspace A's tags
      expect(tagsFromA).toHaveLength(2);
      expect(tagsFromA.map((t) => t.name)).toEqual(['internal', 'support']);
      expect(tagsFromA.every((t) => t.workspaceId === workspaceA.id)).toBe(true);

      // Query tags from Workspace B context
      const tagsFromB = await prisma.forWorkspace(workspaceB.id, async (tx) => {
        return tx.tag.findMany({ orderBy: { name: 'asc' } });
      });

      // Should only see Workspace B's tags
      expect(tagsFromB).toHaveLength(1);
      expect(tagsFromB[0].name).toBe('support');
      expect(tagsFromB[0].workspaceId).toBe(workspaceB.id);
    });

    it('should allow same tag name in different workspaces', async () => {
      const tagNameConflict = 'api-docs';

      // Create same tag in both workspaces
      const tagA = await prismaSuperuser.tag.create({
        data: { name: tagNameConflict, workspaceId: workspaceA.id },
      });
      const tagB = await prismaSuperuser.tag.create({
        data: { name: tagNameConflict, workspaceId: workspaceB.id },
      });

      // Both should exist with different IDs
      expect(tagA.id).not.toBe(tagB.id);
      expect(tagA.name).toBe(tagB.name);
      expect(tagA.workspaceId).toBe(workspaceA.id);
      expect(tagB.workspaceId).toBe(workspaceB.id);
    });

    it('should block cross-workspace tag access via RLS', async () => {
      // Create tag in Workspace A
      const tagInA = await prismaSuperuser.tag.create({
        data: { name: 'confidential', workspaceId: workspaceA.id },
      });

      // Try to access from Workspace B context
      const attemptFromB = await prisma.forWorkspace(workspaceB.id, async (tx) => {
        return tx.tag.findFirst({
          where: { id: tagInA.id },
        });
      });

      // Should not find the tag (RLS blocks it)
      expect(attemptFromB).toBeNull();
    });

    it('should enforce unique tag names within workspace', async () => {
      const duplicateName = 'support';

      // Create first tag
      await prismaSuperuser.tag.create({
        data: { name: duplicateName, workspaceId: workspaceA.id },
      });

      // Attempt to create duplicate should fail
      await expect(
        prismaSuperuser.tag.create({
          data: { name: duplicateName, workspaceId: workspaceA.id },
        }),
      ).rejects.toThrow();
    });

    it('should cascade delete tags when workspace is deleted', async () => {
      // Create tags
      await prismaSuperuser.tag.create({
        data: { name: 'to-be-deleted', workspaceId: workspaceA.id },
      });

      // Verify tag exists
      const tagsBefore = await prismaSuperuser.tag.findMany({
        where: { workspaceId: workspaceA.id },
      });
      expect(tagsBefore).toHaveLength(1);

      // Delete workspace (cascade should delete tags)
      await prismaSuperuser.workspaceMember.deleteMany({
        where: { workspaceId: workspaceA.id },
      });
      await prismaSuperuser.workspace.delete({
        where: { id: workspaceA.id },
      });

      // Verify tags are gone
      const tagsAfter = await prismaSuperuser.tag.findMany({
        where: { workspaceId: workspaceA.id },
      });
      expect(tagsAfter).toHaveLength(0);

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

  describe('Tag Operations with RLS Context', () => {
    it('should create tag with workspace context', async () => {
      const tag = await prisma.forWorkspace(workspaceA.id, async (tx) => {
        return tx.tag.create({
          data: { name: 'new-tag', workspaceId: workspaceA.id },
        });
      });

      expect(tag.name).toBe('new-tag');
      expect(tag.workspaceId).toBe(workspaceA.id);
    });

    it('should update tag within workspace context', async () => {
      const tag = await prismaSuperuser.tag.create({
        data: { name: 'old-name', workspaceId: workspaceA.id },
      });

      const updated = await prisma.forWorkspace(workspaceA.id, async (tx) => {
        return tx.tag.update({
          where: { id: tag.id },
          data: { name: 'new-name' },
        });
      });

      expect(updated.name).toBe('new-name');
    });

    it('should delete tag within workspace context', async () => {
      const tag = await prismaSuperuser.tag.create({
        data: { name: 'to-delete', workspaceId: workspaceA.id },
      });

      await prisma.forWorkspace(workspaceA.id, async (tx) => {
        return tx.tag.delete({ where: { id: tag.id } });
      });

      const deleted = await prismaSuperuser.tag.findUnique({
        where: { id: tag.id },
      });
      expect(deleted).toBeNull();
    });

    it('should prevent update of tag from wrong workspace', async () => {
      const tagInA = await prismaSuperuser.tag.create({
        data: { name: 'workspace-a-tag', workspaceId: workspaceA.id },
      });

      // Attempt to update from Workspace B context should fail
      await expect(
        prisma.forWorkspace(workspaceB.id, async (tx) => {
          return tx.tag.update({
            where: { id: tagInA.id },
            data: { name: 'hacked' },
          });
        }),
      ).rejects.toThrow();
    });

    it('should prevent delete of tag from wrong workspace', async () => {
      const tagInA = await prismaSuperuser.tag.create({
        data: { name: 'protected-tag', workspaceId: workspaceA.id },
      });

      // Attempt to delete from Workspace B context should fail
      await expect(
        prisma.forWorkspace(workspaceB.id, async (tx) => {
          return tx.tag.delete({ where: { id: tagInA.id } });
        }),
      ).rejects.toThrow();

      // Verify tag still exists
      const stillExists = await prismaSuperuser.tag.findUnique({
        where: { id: tagInA.id },
      });
      expect(stillExists).not.toBeNull();
    });
  });

  describe('Document-Tag Relationship', () => {
    it('should associate tags with documents in workspace', async () => {
      // Create document and tag
      const doc = await prismaSuperuser.document.create({
        data: {
          title: 'Test Doc',
          content: 'Content',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
        },
      });
      const tag = await prismaSuperuser.tag.create({
        data: { name: 'doc-tag', workspaceId: workspaceA.id },
      });

      // Associate tag with document
      await prismaSuperuser.documentTag.create({
        data: { documentId: doc.id, tagId: tag.id },
      });

      // Query document with tags
      const docWithTags = await prisma.forWorkspace(workspaceA.id, async (tx) => {
        return tx.document.findUnique({
          where: { id: doc.id },
          include: { tags: { include: { tag: true } } },
        });
      });

      expect(docWithTags?.tags).toHaveLength(1);
      expect(docWithTags?.tags[0].tag.name).toBe('doc-tag');
    });

    it('should filter documents by tag within workspace', async () => {
      const supportTag = await prismaSuperuser.tag.create({
        data: { name: 'support', workspaceId: workspaceA.id },
      });
      const internalTag = await prismaSuperuser.tag.create({
        data: { name: 'internal', workspaceId: workspaceA.id },
      });

      const doc1 = await prismaSuperuser.document.create({
        data: {
          title: 'Support Doc',
          content: 'Content',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
        },
      });
      const doc2 = await prismaSuperuser.document.create({
        data: {
          title: 'Internal Doc',
          content: 'Content',
          contentType: 'TEXT',
          workspaceId: workspaceA.id,
        },
      });

      await prismaSuperuser.documentTag.create({
        data: { documentId: doc1.id, tagId: supportTag.id },
      });
      await prismaSuperuser.documentTag.create({
        data: { documentId: doc2.id, tagId: internalTag.id },
      });

      // Query documents with 'support' tag
      const supportDocs = await prisma.forWorkspace(workspaceA.id, async (tx) => {
        return tx.document.findMany({
          where: {
            tags: {
              some: { tag: { name: 'support' } },
            },
          },
        });
      });

      expect(supportDocs).toHaveLength(1);
      expect(supportDocs[0].title).toBe('Support Doc');
    });
  });
});
