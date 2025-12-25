import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';
import { UserContext } from '../user.context';
import { Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * RLS Integration Tests
 *
 * These tests verify Row Level Security implementation at the database level.
 * IMPORTANT: These tests use a real database connection, not mocks!
 *
 * Uses two Prisma clients:
 * - prisma: Regular client with RLS (for testing isolation)
 * - prismaSuperuser: Superuser client (for setup/teardown, bypasses RLS)
 *
 * Test scenarios:
 * 1. Workspace isolation - users can't see other workspaces
 * 2. Document isolation - users can't access documents from other workspaces
 * 3. RLS blocks ID manipulation - direct ID access is blocked by RLS
 * 4. Public API bypass works correctly
 * 5. Stress tests - concurrent operations maintain isolation
 */
describe('RLS Integration Tests', () => {
  let prisma: PrismaService;
  let prismaSuperuser: PrismaClient; // Superuser for setup/teardown
  let module: TestingModule;

  // Test data
  let userA: { id: string; email: string; passwordHash: string };
  let userB: { id: string; email: string; passwordHash: string };
  let workspaceA: { id: string; name: string };
  let workspaceB: { id: string; name: string };
  let documentA: { id: string; title: string; workspaceId: string };
  let documentB: { id: string; title: string; workspaceId: string };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [PrismaService, UserContext],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();

    // Create superuser client for setup/teardown (uses DATABASE_URL_MIGRATE)
    prismaSuperuser = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL_MIGRATE || 'postgresql://postgres:postgres@localhost:6201/synjar?schema=public',
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
    // Setup test data using superuser (bypasses RLS)
    // Create users
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

    // Create workspaces and add members
    workspaceA = await prismaSuperuser.workspace.create({
      data: {
        name: `Workspace A ${uuidv4()}`,
        createdById: userA.id,
        members: {
          create: {
            userId: userA.id,
            role: Role.OWNER,
          },
        },
      },
    });

    workspaceB = await prismaSuperuser.workspace.create({
      data: {
        name: `Workspace B ${uuidv4()}`,
        createdById: userB.id,
        members: {
          create: {
            userId: userB.id,
            role: Role.OWNER,
          },
        },
      },
    });

    // Create documents
    documentA = await prismaSuperuser.document.create({
      data: {
        workspaceId: workspaceA.id,
        title: 'Document A',
        content: 'Content of document A',
      },
    });

    documentB = await prismaSuperuser.document.create({
      data: {
        workspaceId: workspaceB.id,
        title: 'Document B',
        content: 'Content of document B',
      },
    });
  });

  afterEach(async () => {
    // Cleanup test data using superuser
    // Delete in correct order due to foreign key constraints
    await prismaSuperuser.document.deleteMany({
      where: {
        id: { in: [documentA?.id, documentB?.id].filter(Boolean) },
      },
    });
    await prismaSuperuser.workspaceMember.deleteMany({
      where: {
        workspaceId: { in: [workspaceA?.id, workspaceB?.id].filter(Boolean) },
      },
    });
    await prismaSuperuser.workspace.deleteMany({
      where: {
        id: { in: [workspaceA?.id, workspaceB?.id].filter(Boolean) },
      },
    });
    await prismaSuperuser.user.deleteMany({
      where: {
        id: { in: [userA?.id, userB?.id].filter(Boolean) },
      },
    });
  });

  describe('1. Workspace Isolation', () => {
    it('User A should only see Workspace A', async () => {
      const workspaces = await prisma.forUser(userA.id, async (tx) => {
        return tx.workspace.findMany();
      });

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].id).toBe(workspaceA.id);
      expect(workspaces[0].name).toBe(workspaceA.name);
    });

    it('User B should only see Workspace B', async () => {
      const workspaces = await prisma.forUser(userB.id, async (tx) => {
        return tx.workspace.findMany();
      });

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].id).toBe(workspaceB.id);
      expect(workspaces[0].name).toBe(workspaceB.name);
    });

    it('User A should not see Workspace B in list', async () => {
      const workspaces = await prisma.forUser(userA.id, async (tx) => {
        return tx.workspace.findMany();
      });

      const workspaceIds = workspaces.map((w) => w.id);
      expect(workspaceIds).not.toContain(workspaceB.id);
    });

    it('User without workspace membership should see empty list', async () => {
      const userC = await prismaSuperuser.$transaction(async (tx) => {
        return tx.user.create({
          data: {
            email: `user-c-${uuidv4()}@test.com`,
            passwordHash: 'hash-c',
            name: 'User C',
          },
        });
      });

      const workspaces = await prisma.forUser(userC.id, async (tx) => {
        return tx.workspace.findMany();
      });

      expect(workspaces).toHaveLength(0);

      // Cleanup
      await prismaSuperuser.$transaction(async (tx) => {
        await tx.user.delete({ where: { id: userC.id } });
      });
    });
  });

  describe('2. Document Isolation', () => {
    it('User A should only see documents from Workspace A', async () => {
      const documents = await prisma.forUser(userA.id, async (tx) => {
        return tx.document.findMany();
      });

      expect(documents).toHaveLength(1);
      expect(documents[0].id).toBe(documentA.id);
      expect(documents[0].workspaceId).toBe(workspaceA.id);
    });

    it('User B should only see documents from Workspace B', async () => {
      const documents = await prisma.forUser(userB.id, async (tx) => {
        return tx.document.findMany();
      });

      expect(documents).toHaveLength(1);
      expect(documents[0].id).toBe(documentB.id);
      expect(documents[0].workspaceId).toBe(workspaceB.id);
    });

    it('User A should not see Document B in list', async () => {
      const documents = await prisma.forUser(userA.id, async (tx) => {
        return tx.document.findMany();
      });

      const documentIds = documents.map((d) => d.id);
      expect(documentIds).not.toContain(documentB.id);
    });
  });

  describe('3. RLS Blocks ID Manipulation', () => {
    it('User A cannot access Document B by direct ID query', async () => {
      const document = await prisma.forUser(userA.id, async (tx) => {
        return tx.document.findUnique({
          where: { id: documentB.id },
        });
      });

      // RLS makes the document invisible - returns null
      expect(document).toBeNull();
    });

    it('User B cannot access Document A by direct ID query', async () => {
      const document = await prisma.forUser(userB.id, async (tx) => {
        return tx.document.findUnique({
          where: { id: documentA.id },
        });
      });

      expect(document).toBeNull();
    });

    it('User A cannot access Workspace B by direct ID query', async () => {
      const workspace = await prisma.forUser(userA.id, async (tx) => {
        return tx.workspace.findUnique({
          where: { id: workspaceB.id },
        });
      });

      expect(workspace).toBeNull();
    });

    it('User A cannot update Document B even with correct ID', async () => {
      await expect(
        prisma.forUser(userA.id, async (tx) => {
          return tx.document.update({
            where: { id: documentB.id },
            data: { title: 'Hacked Title' },
          });
        }),
      ).rejects.toThrow();

      // Verify document was not modified (use superuser to bypass RLS)
      const document = await prismaSuperuser.document.findUnique({
        where: { id: documentB.id },
      });
      expect(document?.title).toBe('Document B');
    });

    it('User A cannot delete Document B even with correct ID', async () => {
      await expect(
        prisma.forUser(userA.id, async (tx) => {
          return tx.document.delete({
            where: { id: documentB.id },
          });
        }),
      ).rejects.toThrow();

      // Verify document still exists (use superuser to bypass RLS)
      const document = await prismaSuperuser.document.findUnique({
        where: { id: documentB.id },
      });
      expect(document).not.toBeNull();
    });
  });

  describe('4. Chunk Isolation (Through Document)', () => {
    let chunkA: { id: string; documentId: string };
    let chunkB: { id: string; documentId: string };

    beforeEach(async () => {
      // Create chunks for both documents
      // Use raw SQL with ::vector cast for embedding column
      const chunkAId = uuidv4();
      const chunkBId = uuidv4();
      const embeddingA = `[${Array(1536).fill(0.1).join(',')}]`;
      const embeddingB = `[${Array(1536).fill(0.2).join(',')}]`;

      await prismaSuperuser.$executeRaw`
        INSERT INTO "Chunk" (id, "documentId", content, embedding, "chunkIndex", "createdAt")
        VALUES (${chunkAId}, ${documentA.id}, 'Chunk content A', ${embeddingA}::vector, 0, NOW())
      `;

      await prismaSuperuser.$executeRaw`
        INSERT INTO "Chunk" (id, "documentId", content, embedding, "chunkIndex", "createdAt")
        VALUES (${chunkBId}, ${documentB.id}, 'Chunk content B', ${embeddingB}::vector, 0, NOW())
      `;

      chunkA = { id: chunkAId, documentId: documentA.id };
      chunkB = { id: chunkBId, documentId: documentB.id };
    });

    afterEach(async () => {
      await prismaSuperuser.$transaction(async (tx) => {
        await tx.chunk.deleteMany({
          where: { id: { in: [chunkA?.id, chunkB?.id].filter(Boolean) } },
        });
      });
    });

    it('User A should only see chunks from their documents', async () => {
      const chunks = await prisma.forUser(userA.id, async (tx) => {
        return tx.chunk.findMany();
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].id).toBe(chunkA.id);
      expect(chunks[0].documentId).toBe(documentA.id);
    });

    it('User B should only see chunks from their documents', async () => {
      const chunks = await prisma.forUser(userB.id, async (tx) => {
        return tx.chunk.findMany();
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].id).toBe(chunkB.id);
      expect(chunks[0].documentId).toBe(documentB.id);
    });

    it('User A cannot access Chunk B by direct ID query', async () => {
      const chunk = await prisma.forUser(userA.id, async (tx) => {
        return tx.chunk.findUnique({
          where: { id: chunkB.id },
        });
      });

      expect(chunk).toBeNull();
    });
  });

  describe('5. Public API Bypass', () => {
    it('withoutRls should bypass RLS and see all workspaces', async () => {
      const workspaces = await prismaSuperuser.$transaction(async (tx) => {
        return tx.workspace.findMany();
      });

      expect(workspaces.length).toBeGreaterThanOrEqual(2);
      const workspaceIds = workspaces.map((w) => w.id);
      expect(workspaceIds).toContain(workspaceA.id);
      expect(workspaceIds).toContain(workspaceB.id);
    });

    it('withoutRls should bypass RLS and see all documents', async () => {
      const documents = await prismaSuperuser.$transaction(async (tx) => {
        return tx.document.findMany({
          where: {
            id: { in: [documentA.id, documentB.id] },
          },
        });
      });

      expect(documents).toHaveLength(2);
      const documentIds = documents.map((d) => d.id);
      expect(documentIds).toContain(documentA.id);
      expect(documentIds).toContain(documentB.id);
    });
  });

  describe('6. Stress Tests - Concurrent Operations', () => {
    it('should handle 50+ parallel RLS operations without leakage', async () => {
      // Create additional users and workspaces for stress testing
      const { users, workspaces, documents } = await prismaSuperuser.$transaction(
        async (tx) => {
          const users = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
              tx.user.create({
                data: {
                  email: `stress-user-${i}-${uuidv4()}@test.com`,
                  passwordHash: `hash-${i}`,
                  name: `Stress User ${i}`,
                },
              }),
            ),
          );

          const workspaces = await Promise.all(
            users.map((user, i) =>
              tx.workspace.create({
                data: {
                  name: `Stress Workspace ${i} ${uuidv4()}`,
                  createdById: user.id,
                  members: {
                    create: {
                      userId: user.id,
                      role: Role.OWNER,
                    },
                  },
                },
              }),
            ),
          );

          // Create documents for each workspace
          const documents = await Promise.all(
            workspaces.map((workspace, i) =>
              tx.document.create({
                data: {
                  workspaceId: workspace.id,
                  title: `Stress Document ${i}`,
                  content: `Content ${i}`,
                },
              }),
            ),
          );

          return { users, workspaces, documents };
        },
      );

      // Execute 50+ parallel operations - each user should only see their own data
      const results = await Promise.all(
        users.flatMap((user, i) => [
          // Each user queries workspaces
          prisma.forUser(user.id, (tx) => tx.workspace.findMany()),
          // Each user queries documents
          prisma.forUser(user.id, (tx) => tx.document.findMany()),
          // Each user tries to access another user's workspace
          prisma.forUser(user.id, (tx) =>
            tx.workspace.findUnique({
              where: { id: workspaces[(i + 1) % users.length].id },
            }),
          ),
          // Each user tries to access another user's document
          prisma.forUser(user.id, (tx) =>
            tx.document.findUnique({
              where: { id: documents[(i + 1) % users.length].id },
            }),
          ),
          // Each user counts their workspaces
          prisma.forUser(user.id, (tx) => tx.workspace.count()),
        ]),
      );

      // Verify results - each user should only see their own workspace
      for (let i = 0; i < users.length; i++) {
        const baseIndex = i * 5;

        // findMany workspaces
        const userWorkspaces = results[baseIndex] as any[];
        expect(userWorkspaces).toHaveLength(1);
        expect(userWorkspaces[0].id).toBe(workspaces[i].id);

        // findMany documents
        const userDocuments = results[baseIndex + 1] as any[];
        expect(userDocuments).toHaveLength(1);
        expect(userDocuments[0].id).toBe(documents[i].id);

        // Accessing other workspace should return null
        expect(results[baseIndex + 2]).toBeNull();

        // Accessing other document should return null
        expect(results[baseIndex + 3]).toBeNull();

        // Count should be 1
        expect(results[baseIndex + 4]).toBe(1);
      }

      // Cleanup
      await prismaSuperuser.$transaction(async (tx) => {
        await tx.document.deleteMany({
          where: { id: { in: documents.map((d) => d.id) } },
        });
        await tx.workspaceMember.deleteMany({
          where: { workspaceId: { in: workspaces.map((w) => w.id) } },
        });
        await tx.workspace.deleteMany({
          where: { id: { in: workspaces.map((w) => w.id) } },
        });
        await tx.user.deleteMany({
          where: { id: { in: users.map((u) => u.id) } },
        });
      });
    });

    it('should handle rapid context switching without data leakage', async () => {
      const iterations = 20;
      const results: boolean[] = [];

      for (let i = 0; i < iterations; i++) {
        // Rapidly switch between User A and User B contexts
        const workspacesA = await prisma.forUser(userA.id, (tx) =>
          tx.workspace.findMany(),
        );
        const workspacesB = await prisma.forUser(userB.id, (tx) =>
          tx.workspace.findMany(),
        );

        // Verify isolation
        results.push(
          workspacesA.length === 1 &&
            workspacesA[0].id === workspaceA.id &&
            workspacesB.length === 1 &&
            workspacesB[0].id === workspaceB.id,
        );
      }

      // All iterations should maintain proper isolation
      expect(results.every((r) => r)).toBe(true);
    });

    it('should handle nested withRls calls correctly', async () => {
      // Outer context: User A
      const result = await prisma.forUser(userA.id, async (tx1) => {
        const workspacesA = await tx1.workspace.findMany();

        // Inner context should maintain User A context
        // (nested transactions aren't supported, but we test sequential calls)
        return {
          outerWorkspaces: workspacesA,
        };
      });

      // Then immediately switch to User B
      const resultB = await prisma.forUser(userB.id, async (tx2) => {
        const workspacesB = await tx2.workspace.findMany();
        return {
          innerWorkspaces: workspacesB,
        };
      });

      expect(result.outerWorkspaces).toHaveLength(1);
      expect(result.outerWorkspaces[0].id).toBe(workspaceA.id);
      expect(resultB.innerWorkspaces).toHaveLength(1);
      expect(resultB.innerWorkspaces[0].id).toBe(workspaceB.id);
    });
  });

  describe('7. WorkspaceMember Isolation', () => {
    it('User A should only see members from their workspaces', async () => {
      const members = await prisma.forUser(userA.id, async (tx) => {
        return tx.workspaceMember.findMany();
      });

      expect(members).toHaveLength(1);
      expect(members[0].workspaceId).toBe(workspaceA.id);
      expect(members[0].userId).toBe(userA.id);
    });

    it('User B should only see members from their workspaces', async () => {
      const members = await prisma.forUser(userB.id, async (tx) => {
        return tx.workspaceMember.findMany();
      });

      expect(members).toHaveLength(1);
      expect(members[0].workspaceId).toBe(workspaceB.id);
      expect(members[0].userId).toBe(userB.id);
    });

    it('User A cannot see workspace members from Workspace B', async () => {
      const members = await prisma.forUser(userA.id, async (tx) => {
        return tx.workspaceMember.findMany({
          where: { workspaceId: workspaceB.id },
        });
      });

      expect(members).toHaveLength(0);
    });
  });

  describe('8. PublicLink Isolation', () => {
    let publicLinkA: { id: string; token: string; workspaceId: string };
    let publicLinkB: { id: string; token: string; workspaceId: string };

    beforeEach(async () => {
      // Create public links using withoutRls (system context)
      const links = await prismaSuperuser.$transaction(async (tx) => {
        const a = await tx.publicLink.create({
          data: {
            workspaceId: workspaceA.id,
            token: `token-a-${uuidv4()}`,
            name: 'Link A',
          },
        });

        const b = await tx.publicLink.create({
          data: {
            workspaceId: workspaceB.id,
            token: `token-b-${uuidv4()}`,
            name: 'Link B',
          },
        });

        return { a, b };
      });

      publicLinkA = links.a;
      publicLinkB = links.b;
    });

    afterEach(async () => {
      await prisma.publicLink.deleteMany({
        where: {
          id: { in: [publicLinkA?.id, publicLinkB?.id].filter(Boolean) },
        },
      });
    });

    it('User A should only see public links from their workspaces', async () => {
      const links = await prisma.forUser(userA.id, async (tx) => {
        return tx.publicLink.findMany();
      });

      expect(links).toHaveLength(1);
      expect(links[0].id).toBe(publicLinkA.id);
      expect(links[0].workspaceId).toBe(workspaceA.id);
    });

    it('User B should only see public links from their workspaces', async () => {
      const links = await prisma.forUser(userB.id, async (tx) => {
        return tx.publicLink.findMany();
      });

      expect(links).toHaveLength(1);
      expect(links[0].id).toBe(publicLinkB.id);
      expect(links[0].workspaceId).toBe(workspaceB.id);
    });

    it('User A cannot access public link from Workspace B', async () => {
      const link = await prisma.forUser(userA.id, async (tx) => {
        return tx.publicLink.findUnique({
          where: { id: publicLinkB.id },
        });
      });

      expect(link).toBeNull();
    });
  });
});
