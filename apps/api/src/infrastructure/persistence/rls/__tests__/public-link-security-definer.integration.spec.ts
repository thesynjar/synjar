import { PrismaClient, User, Workspace, PublicLink } from '@prisma/client';
import { v4 as uuid } from 'uuid';

/**
 * Integration tests for lookup_public_link_by_token() SECURITY DEFINER function.
 *
 * This function bypasses RLS to allow unauthenticated token lookups.
 * It's security-critical and must be thoroughly tested.
 *
 * Tests verify:
 * - Token lookup without RLS context
 * - isActive validation
 * - expiresAt validation
 * - Workspace isolation
 * - SQL injection protection
 */
describe('Public Link SECURITY DEFINER Function', () => {
  let prisma: PrismaClient;
  let prismaSuperuser: PrismaClient;

  let testUser: User;
  let workspaceA: Workspace;
  let workspaceB: Workspace;
  let publicLinkA: PublicLink;
  let publicLinkB: PublicLink;

  beforeAll(async () => {
    // Main client (uses DATABASE_URL)
    prisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            'postgresql://postgres:postgres@localhost:6201/synjar?schema=public',
        },
      },
    });

    // Superuser client for setup/teardown (uses DATABASE_URL_MIGRATE)
    prismaSuperuser = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL_MIGRATE ||
            'postgresql://postgres:postgres@localhost:6201/synjar?schema=public',
        },
      },
    });

    await prisma.$connect();
    await prismaSuperuser.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await prismaSuperuser.$disconnect();
  });

  beforeEach(async () => {

    // Create test user
    testUser = await prismaSuperuser.user.create({
      data: {
        id: uuid(),
        email: `test-${uuid()}@example.com`,
        passwordHash: 'hashed-password',
        name: 'Test User',
        emailVerifiedAt: new Date(),
      },
    });

    // Create workspace A
    workspaceA = await prismaSuperuser.workspace.create({
      data: {
        id: uuid(),
        name: 'Workspace A',
        createdById: testUser.id,
        members: {
          create: {
            userId: testUser.id,
            role: 'OWNER',
          },
        },
      },
    });

    // Create workspace B
    workspaceB = await prismaSuperuser.workspace.create({
      data: {
        id: uuid(),
        name: 'Workspace B',
        createdById: testUser.id,
        members: {
          create: {
            userId: testUser.id,
            role: 'OWNER',
          },
        },
      },
    });

    // Create active public link for workspace A
    publicLinkA = await prismaSuperuser.publicLink.create({
      data: {
        id: uuid(),
        workspaceId: workspaceA.id,
        token: `token-a-${uuid().replace(/-/g, '')}`.substring(0, 64),
        name: 'Link A',
        isActive: true,
        expiresAt: null,
      },
    });

    // Create active public link for workspace B
    publicLinkB = await prismaSuperuser.publicLink.create({
      data: {
        id: uuid(),
        workspaceId: workspaceB.id,
        token: `token-b-${uuid().replace(/-/g, '')}`.substring(0, 64),
        name: 'Link B',
        isActive: true,
        expiresAt: null,
      },
    });
  });

  afterEach(async () => {
    // Clean up test data in reverse order of dependencies
    if (publicLinkA?.id || publicLinkB?.id) {
      await prismaSuperuser.publicLink.deleteMany({
        where: {
          id: { in: [publicLinkA?.id, publicLinkB?.id].filter(Boolean) as string[] },
        },
      });
    }

    if (workspaceA?.id || workspaceB?.id) {
      // Delete workspace members first
      await prismaSuperuser.workspaceMember.deleteMany({
        where: {
          workspaceId: { in: [workspaceA?.id, workspaceB?.id].filter(Boolean) as string[] },
        },
      });

      // Then delete workspaces
      await prismaSuperuser.workspace.deleteMany({
        where: {
          id: { in: [workspaceA?.id, workspaceB?.id].filter(Boolean) as string[] },
        },
      });
    }

    if (testUser?.id) {
      await prismaSuperuser.user.delete({
        where: { id: testUser.id },
      });
    }
  });

  describe('Token Lookup (without RLS context)', () => {
    it('should find public link by valid token WITHOUT RLS context', async () => {
      // CRITICAL: No RLS context set (simulates unauthenticated request)
      const results = await prisma.$queryRaw<
        Array<{
          id: string;
          workspace_id: string;
          token: string;
          is_active: boolean;
          expires_at: Date | null;
          workspace_name: string;
        }>
      >`SELECT * FROM lookup_public_link_by_token(${publicLinkA.token})`;

      expect(results).toHaveLength(1);
      expect(results[0].token).toBe(publicLinkA.token);
      expect(results[0].workspace_id).toBe(workspaceA.id);
      expect(results[0].is_active).toBe(true);
    });

    it('should return empty for invalid token', async () => {
      const results = await prisma.$queryRaw<
        Array<{ id: string }>
      >`SELECT * FROM lookup_public_link_by_token(${'invalid-token-does-not-exist-xxxxxxxxxxxxxxxxxxxxxxx'})`;

      expect(results).toHaveLength(0);
    });

    it('should return workspace data joined correctly', async () => {
      const results = await prisma.$queryRaw<
        Array<{
          workspace_name: string;
          workspace_created_by_id: string;
        }>
      >`SELECT * FROM lookup_public_link_by_token(${publicLinkA.token})`;

      expect(results).toHaveLength(1);
      expect(results[0].workspace_name).toBe(workspaceA.name);
      expect(results[0].workspace_created_by_id).toBe(workspaceA.createdById);
    });
  });

  describe('Workspace Isolation', () => {
    it('should NOT expose other workspace links when querying token', async () => {
      // Query token A
      const resultsA = await prisma.$queryRaw<
        Array<{ workspace_id: string }>
      >`SELECT * FROM lookup_public_link_by_token(${publicLinkA.token})`;

      expect(resultsA).toHaveLength(1);
      expect(resultsA[0].workspace_id).toBe(workspaceA.id);
      // Should NOT see workspace B data when querying token A
      expect(resultsA[0].workspace_id).not.toBe(workspaceB.id);

      // Query token B
      const resultsB = await prisma.$queryRaw<
        Array<{ workspace_id: string }>
      >`SELECT * FROM lookup_public_link_by_token(${publicLinkB.token})`;

      expect(resultsB).toHaveLength(1);
      expect(resultsB[0].workspace_id).toBe(workspaceB.id);
    });
  });

  describe('isActive Validation', () => {
    it('should NOT return inactive links (isActive=false)', async () => {
      // Create inactive link
      const inactiveLink = await prismaSuperuser.publicLink.create({
        data: {
          id: uuid(),
          workspaceId: workspaceA.id,
          token: `inactive-${uuid().replace(/-/g, '')}`.substring(0, 64),
          isActive: false,
        },
      });

      const results = await prisma.$queryRaw<
        Array<{ id: string }>
      >`SELECT * FROM lookup_public_link_by_token(${inactiveLink.token})`;

      // Should return empty (isActive validation in SQL)
      expect(results).toHaveLength(0);
    });
  });

  describe('expiresAt Validation', () => {
    it('should NOT return expired links (expiresAt < NOW)', async () => {
      // Create expired link (past date)
      const expiredLink = await prismaSuperuser.publicLink.create({
        data: {
          id: uuid(),
          workspaceId: workspaceA.id,
          token: `expired-${uuid().replace(/-/g, '')}`.substring(0, 64),
          isActive: true,
          expiresAt: new Date('2020-01-01'), // Past date
        },
      });

      const results = await prisma.$queryRaw<
        Array<{ id: string }>
      >`SELECT * FROM lookup_public_link_by_token(${expiredLink.token})`;

      // Should return empty (expiresAt validation in SQL)
      expect(results).toHaveLength(0);
    });

    it('should return links with future expiresAt', async () => {
      // Create link with future expiration
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const futureLink = await prismaSuperuser.publicLink.create({
        data: {
          id: uuid(),
          workspaceId: workspaceA.id,
          token: `future-${uuid().replace(/-/g, '')}`.substring(0, 64),
          isActive: true,
          expiresAt: futureDate,
        },
      });

      const results = await prisma.$queryRaw<
        Array<{ id: string }>
      >`SELECT * FROM lookup_public_link_by_token(${futureLink.token})`;

      expect(results).toHaveLength(1);
    });

    it('should return links with NULL expiresAt (never expires)', async () => {
      // publicLinkA already has expiresAt: null
      const results = await prisma.$queryRaw<
        Array<{ id: string; expires_at: Date | null }>
      >`SELECT * FROM lookup_public_link_by_token(${publicLinkA.token})`;

      expect(results).toHaveLength(1);
      expect(results[0].expires_at).toBeNull();
    });
  });

  describe('SQL Injection Protection', () => {
    it('should be safe from SQL injection attempts', async () => {
      const maliciousTokens = [
        "'; DROP TABLE \"PublicLink\"; --",
        "token' OR '1'='1",
        "token' UNION SELECT * FROM \"Workspace\" --",
        "'; SELECT pg_sleep(10); --",
      ];

      for (const token of maliciousTokens) {
        const results = await prisma.$queryRaw<
          Array<{ id: string }>
        >`SELECT * FROM lookup_public_link_by_token(${token})`;

        // Should return empty, not execute injection
        expect(results).toHaveLength(0);
      }

      // Verify tables still exist and have data
      const workspaceCount = await prismaSuperuser.workspace.count();
      expect(workspaceCount).toBeGreaterThanOrEqual(2);

      const publicLinkCount = await prismaSuperuser.publicLink.count();
      expect(publicLinkCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Combined Validations', () => {
    it('should NOT return inactive AND expired links', async () => {
      const inactiveExpiredLink = await prismaSuperuser.publicLink.create({
        data: {
          id: uuid(),
          workspaceId: workspaceA.id,
          token: `inactive-expired-${uuid().replace(/-/g, '')}`.substring(0, 64),
          isActive: false,
          expiresAt: new Date('2020-01-01'),
        },
      });

      const results = await prisma.$queryRaw<
        Array<{ id: string }>
      >`SELECT * FROM lookup_public_link_by_token(${inactiveExpiredLink.token})`;

      expect(results).toHaveLength(0);
    });
  });
});
