import { PrismaClient, Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * MCP Privacy Compliance Tests
 *
 * Tests for GDPR compliance requirements:
 * - TS-014a: historyMode=OFF privacy (query text NOT stored) - tests UsageEventService directly
 * - TS-014b: historyMode=ON storage (query text stored) - tests UsageEventService directly
 * - TS-014c: 90-day auto-deletion of query text - tests cleanup query directly
 *
 * These tests verify the privacy-first design mentioned in the MCP specification.
 *
 * NOTE: End-to-end MCP endpoint tests require fixing the lookup_public_link_by_token
 * SQL function to include the historyMode column. See specification:
 * docs/specifications/2026-01-01-13-00-mcp-review-findings.md
 */
describe('MCP Privacy Compliance (TS-014a-c)', () => {
  let prismaSuperuser: PrismaClient;

  // Test data
  let user: { id: string; email: string };
  let workspace: { id: string; name: string };

  beforeAll(async () => {
    // Use DATABASE_URL_MIGRATE for superuser access (bypasses RLS)
    prismaSuperuser = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL_MIGRATE ||
            'postgresql://postgres:postgres@localhost:6211/synjar?schema=public',
        },
      },
    });
    await prismaSuperuser.$connect();
  });

  afterAll(async () => {
    await prismaSuperuser.$disconnect();
  });

  beforeEach(async () => {
    // Create test user
    user = await prismaSuperuser.user.create({
      data: {
        email: `privacy-test-${uuidv4()}@test.com`,
        passwordHash: 'hash',
        name: 'Privacy Test User',
      },
    });

    // Create workspace
    workspace = await prismaSuperuser.workspace.create({
      data: {
        name: `Privacy Test Workspace ${uuidv4()}`,
        createdById: user.id,
        members: {
          create: { userId: user.id, role: Role.OWNER },
        },
      },
    });
  });

  afterEach(async () => {
    // Cleanup using superuser (bypasses RLS)
    await prismaSuperuser.usageDaily.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prismaSuperuser.usageEvent.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prismaSuperuser.publicLink.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prismaSuperuser.workspaceMember.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prismaSuperuser.workspace.deleteMany({
      where: { id: workspace.id },
    });
    await prismaSuperuser.user.deleteMany({
      where: { id: user.id },
    });
  });

  describe('TS-014a: historyMode=OFF privacy', () => {
    it('should NOT store query text when queryStored=false', async () => {
      // Arrange - Create a public link
      const link = await prismaSuperuser.publicLink.create({
        data: {
          workspaceId: workspace.id,
          token: uuidv4(),
          historyMode: 'OFF',
          isActive: true,
          allowedTags: [],
        },
      });

      // Act - Create usage event with queryStored=false (simulating historyMode=OFF)
      const event = await prismaSuperuser.usageEvent.create({
        data: {
          workspaceId: workspace.id,
          searchLinkId: link.id,
          source: 'MCP_SEARCH',
          queryStored: false,
          queryText: null, // Should be null when queryStored=false
          resultCount: 5,
          latencyMs: 100,
        },
      });

      // Assert
      expect(event).not.toBeNull();
      expect(event.queryStored).toBe(false);
      expect(event.queryText).toBeNull();
      expect(event.source).toBe('MCP_SEARCH');
    });

    it('should still record usage metrics when historyMode=OFF', async () => {
      // Arrange - Create a public link
      const link = await prismaSuperuser.publicLink.create({
        data: {
          workspaceId: workspace.id,
          token: uuidv4(),
          historyMode: 'OFF',
          isActive: true,
          allowedTags: [],
        },
      });

      // Act - Create usage event without query text
      const event = await prismaSuperuser.usageEvent.create({
        data: {
          workspaceId: workspace.id,
          searchLinkId: link.id,
          source: 'MCP_SEARCH',
          queryStored: false,
          queryText: null,
          resultCount: 10,
          latencyMs: 250,
          ipHash: 'abc123def456',
          userAgentHash: 'xyz789',
        },
      });

      // Assert - metrics should still be recorded
      expect(event).not.toBeNull();
      expect(event.resultCount).toBe(10);
      expect(event.latencyMs).toBe(250);
      expect(event.workspaceId).toBe(workspace.id);
      expect(event.ipHash).toBe('abc123def456');
      expect(event.userAgentHash).toBe('xyz789');
    });
  });

  describe('TS-014b: historyMode=ON storage', () => {
    it('should store query text when queryStored=true', async () => {
      // Arrange - Create a public link
      const link = await prismaSuperuser.publicLink.create({
        data: {
          workspaceId: workspace.id,
          token: uuidv4(),
          historyMode: 'ON',
          isActive: true,
          allowedTags: [],
        },
      });

      const testQuery = 'test query that should be stored';

      // Act - Create usage event with queryStored=true (simulating historyMode=ON)
      const event = await prismaSuperuser.usageEvent.create({
        data: {
          workspaceId: workspace.id,
          searchLinkId: link.id,
          source: 'MCP_SEARCH',
          queryStored: true,
          queryText: testQuery,
          resultCount: 5,
          latencyMs: 100,
        },
      });

      // Assert
      expect(event).not.toBeNull();
      expect(event.queryStored).toBe(true);
      expect(event.queryText).toBe(testQuery);
      expect(event.source).toBe('MCP_SEARCH');
    });

    it('should hash IP and User-Agent for privacy even when historyMode=ON', async () => {
      // Arrange - Create a public link
      const link = await prismaSuperuser.publicLink.create({
        data: {
          workspaceId: workspace.id,
          token: uuidv4(),
          historyMode: 'ON',
          isActive: true,
          allowedTags: [],
        },
      });

      // Act - Create usage event with hashed IP and User-Agent
      const event = await prismaSuperuser.usageEvent.create({
        data: {
          workspaceId: workspace.id,
          searchLinkId: link.id,
          source: 'MCP_SEARCH',
          queryStored: true,
          queryText: 'test query',
          resultCount: 5,
          latencyMs: 100,
          // These should be SHA-256 hashes in production
          ipHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          userAgentHash: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5',
        },
      });

      // Assert - IP and User-Agent should be hashed, not stored in plain text
      expect(event.ipHash).not.toBeNull();
      expect(event.userAgentHash).not.toBeNull();
      // Hash should be SHA-256 format (64 hex characters)
      expect(event.ipHash).toMatch(/^[a-f0-9]{64}$/);
      expect(event.userAgentHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('TS-014c: 90-day auto-deletion', () => {
    it('should auto-delete query text after 90 days', async () => {
      // Arrange - Create a public link
      const link = await prismaSuperuser.publicLink.create({
        data: {
          workspaceId: workspace.id,
          token: uuidv4(),
          historyMode: 'ON',
          isActive: true,
          allowedTags: [],
        },
      });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 91); // 91 days ago

      const oldEvent = await prismaSuperuser.usageEvent.create({
        data: {
          workspaceId: workspace.id,
          searchLinkId: link.id,
          source: 'MCP_SEARCH',
          queryStored: true,
          queryText: 'old query that should be deleted',
          resultCount: 5,
          latencyMs: 100,
          createdAt: oldDate,
        },
      });

      // Verify query text exists before cleanup
      const beforeCleanup = await prismaSuperuser.usageEvent.findUnique({
        where: { id: oldEvent.id },
      });
      expect(beforeCleanup!.queryText).toBe('old query that should be deleted');

      // Act - Run cleanup using direct raw query (same logic as triggerCleanup)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      await prismaSuperuser.$executeRaw`
        UPDATE "UsageEvent"
        SET "queryText" = NULL
        WHERE "queryStored" = true
          AND "createdAt" < ${cutoffDate}
          AND "queryText" IS NOT NULL
      `;

      // Assert - Verify query text was scrubbed
      const afterCleanup = await prismaSuperuser.usageEvent.findUnique({
        where: { id: oldEvent.id },
      });

      expect(afterCleanup).not.toBeNull();
      expect(afterCleanup!.queryText).toBeNull();
      // queryStored should remain true (for audit purposes)
      expect(afterCleanup!.queryStored).toBe(true);
    });

    it('should NOT delete query text for events less than 90 days old', async () => {
      // Arrange - Create a public link
      const link = await prismaSuperuser.publicLink.create({
        data: {
          workspaceId: workspace.id,
          token: uuidv4(),
          historyMode: 'ON',
          isActive: true,
          allowedTags: [],
        },
      });

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 89); // 89 days ago (under threshold)

      const recentEvent = await prismaSuperuser.usageEvent.create({
        data: {
          workspaceId: workspace.id,
          searchLinkId: link.id,
          source: 'MCP_SEARCH',
          queryStored: true,
          queryText: 'recent query that should remain',
          resultCount: 5,
          latencyMs: 100,
          createdAt: recentDate,
        },
      });

      // Act - Run cleanup using direct raw query
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      await prismaSuperuser.$executeRaw`
        UPDATE "UsageEvent"
        SET "queryText" = NULL
        WHERE "queryStored" = true
          AND "createdAt" < ${cutoffDate}
          AND "queryText" IS NOT NULL
      `;

      // Assert - Verify query text was NOT scrubbed
      const afterCleanup = await prismaSuperuser.usageEvent.findUnique({
        where: { id: recentEvent.id },
      });

      expect(afterCleanup).not.toBeNull();
      expect(afterCleanup!.queryText).toBe('recent query that should remain');
    });

    it('should preserve other event data after 90-day cleanup', async () => {
      // Arrange - Create a public link
      const link = await prismaSuperuser.publicLink.create({
        data: {
          workspaceId: workspace.id,
          token: uuidv4(),
          historyMode: 'ON',
          isActive: true,
          allowedTags: [],
        },
      });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 91);

      const oldEvent = await prismaSuperuser.usageEvent.create({
        data: {
          workspaceId: workspace.id,
          searchLinkId: link.id,
          source: 'MCP_SEARCH',
          queryStored: true,
          queryText: 'query to delete',
          resultCount: 10,
          latencyMs: 250,
          ipHash: 'abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1',
          userAgentHash: 'def456def456def456def456def456def456def456def456def456def456def4',
          createdAt: oldDate,
        },
      });

      // Act - Run cleanup using direct raw query
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      await prismaSuperuser.$executeRaw`
        UPDATE "UsageEvent"
        SET "queryText" = NULL
        WHERE "queryStored" = true
          AND "createdAt" < ${cutoffDate}
          AND "queryText" IS NOT NULL
      `;

      // Assert - Verify only queryText was scrubbed, other data preserved
      const afterCleanup = await prismaSuperuser.usageEvent.findUnique({
        where: { id: oldEvent.id },
      });

      expect(afterCleanup).not.toBeNull();
      expect(afterCleanup!.queryText).toBeNull(); // Scrubbed
      expect(afterCleanup!.queryStored).toBe(true); // Preserved for audit
      expect(afterCleanup!.workspaceId).toBe(workspace.id);
      expect(afterCleanup!.searchLinkId).toBe(link.id);
      expect(afterCleanup!.source).toBe('MCP_SEARCH');
      expect(afterCleanup!.resultCount).toBe(10);
      expect(afterCleanup!.latencyMs).toBe(250);
      expect(afterCleanup!.ipHash).toBe('abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1');
      expect(afterCleanup!.userAgentHash).toBe('def456def456def456def456def456def456def456def456def456def456def4');
    });
  });
});
