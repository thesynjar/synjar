import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';
import { PublicLinkService } from '../src/application/public-link/public-link.service';
import { v4 as uuidv4 } from 'uuid';
import { EMBEDDINGS_SERVICE } from '../src/domain/document/embeddings.port';

/**
 * Mock embeddings service for tests
 * Returns a fixed embedding vector (1536 dimensions for text-embedding-3-small)
 */
const mockEmbeddingsService = {
  generateEmbedding: jest.fn().mockResolvedValue({
    embedding: new Array(1536).fill(0).map((_, i) => i / 1536),
    tokenCount: 10,
  }),
  generateEmbeddings: jest.fn().mockImplementation((texts: string[]) =>
    Promise.resolve(
      texts.map(() => ({
        embedding: new Array(1536).fill(0).map((_, i) => i / 1536),
        tokenCount: 10,
      })),
    ),
  ),
};

/**
 * MCP Streamable HTTP Integration Tests
 *
 * Tests for MCP protocol compliance per specification 2025-06-18:
 * - POST /mcp/:token with method: 'initialize' - returns server capabilities
 * - POST /mcp/:token with method: 'tools/list' - returns available tools
 * - GET /mcp/:token - returns 405 (SSE not supported)
 *
 * Related: docs/specifications/2026-01-05-mcp-streamable-http-chatgpt.md
 */
describe('MCP Streamable HTTP (initialize, tools/list, GET 405)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let publicLinkService: PublicLinkService;
  let testAccessToken: string;
  let testWorkspaceId: string;
  let testUserId: string;
  let testPublicLink: { id: string; token: string };

  const TEST_EMAIL_DOMAIN = '@mcp-streamable-http-test.com';

  async function cleanupTestData() {
    try {
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          -- Delete PublicLink entries for test workspaces
          DELETE FROM "PublicLink"
          WHERE "workspaceId" IN (
            SELECT id FROM "Workspace"
            WHERE "createdById" IN (
              SELECT id FROM "User" WHERE email LIKE '%${TEST_EMAIL_DOMAIN}'
            )
          );

          -- Delete WorkspaceMember entries
          DELETE FROM "WorkspaceMember"
          WHERE "workspaceId" IN (
            SELECT id FROM "Workspace"
            WHERE "createdById" IN (
              SELECT id FROM "User" WHERE email LIKE '%${TEST_EMAIL_DOMAIN}'
            )
          );

          -- Delete Workspace entries
          DELETE FROM "Workspace"
          WHERE "createdById" IN (
            SELECT id FROM "User" WHERE email LIKE '%${TEST_EMAIL_DOMAIN}'
          );

          -- Delete User entries
          DELETE FROM "User" WHERE email LIKE '%${TEST_EMAIL_DOMAIN}';
        END $$;
      `);
    } catch (error) {
      console.warn('Cleanup failed:', (error as Error).message);
    }
  }

  beforeAll(async () => {
    // Set self-hosted mode - no email verification required
    process.env.DEPLOYMENT_MODE = 'self-hosted';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [await AppModule.forRoot()],
    })
      .overrideProvider(EMBEDDINGS_SERVICE)
      .useValue(mockEmbeddingsService)
      .compile();

    app = moduleFixture.createNestApplication();

    // Apply same middleware as production
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // Get services from DI container
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    publicLinkService = moduleFixture.get<PublicLinkService>(PublicLinkService);

    // Clean up any existing test data
    await cleanupTestData();

    // Create test user and workspace via HTTP API
    const email = `user-${Date.now()}${TEST_EMAIL_DOMAIN}`;

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'TestPass123!@#',
        workspaceName: 'Test Workspace',
        name: 'Test User',
      })
      .expect(201);

    testUserId = registerRes.body.userId;
    testAccessToken = registerRes.body.accessToken;

    // Get workspace ID
    const workspacesRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${testAccessToken}`)
      .expect(200);

    testWorkspaceId = workspacesRes.body[0].id;

    // Create a PublicLink for testing (no tag restrictions for simpler testing)
    testPublicLink = await publicLinkService.create(testWorkspaceId, testUserId, {
      name: 'MCP Streamable HTTP Test Link',
      allowedTags: [],
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  // ==========================================================================
  // GET Handler Tests - Returns 405 (SSE not supported)
  // ==========================================================================

  describe('GET /mcp/:token - SSE not supported', () => {
    it('should return 405 for GET requests with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get(`/mcp/${testPublicLink.token}`)
        .expect(405);

      expect(response.body).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32601,
          message: 'Method not allowed. Use POST for JSON-RPC requests.',
        },
      });
    });

    it('should return 405 for GET requests with invalid token (no enumeration)', async () => {
      // Invalid token should still return 405, not 400 or 404
      // This prevents token enumeration via different responses
      const invalidToken = 'a'.repeat(64);

      const response = await request(app.getHttpServer())
        .get(`/mcp/${invalidToken}`)
        .expect(405);

      expect(response.body.error.code).toBe(-32601);
      expect(response.body.error.message).toContain('Method not allowed');
    });

    it('should return 405 for GET requests with malformed token', async () => {
      // Even malformed tokens should return 405 for GET
      const malformedToken = 'not-a-valid-token';

      const response = await request(app.getHttpServer())
        .get(`/mcp/${encodeURIComponent(malformedToken)}`)
        .expect(405);

      expect(response.body.error.code).toBe(-32601);
    });
  });

  // ==========================================================================
  // Initialize Method Tests
  // ==========================================================================

  describe('POST /mcp/:token method: initialize', () => {
    it('should return server capabilities and protocol version', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: `init-${uuidv4()}`,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        })
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBeDefined();
      expect(response.body.result).toBeDefined();

      // Verify protocol version
      expect(response.body.result.protocolVersion).toBe('2025-06-18');

      // Verify capabilities (tools capability enabled)
      expect(response.body.result.capabilities).toBeDefined();
      expect(response.body.result.capabilities.tools).toBeDefined();

      // Verify server info
      expect(response.body.result.serverInfo).toBeDefined();
      expect(response.body.result.serverInfo.name).toBe('Synjar MCP Server');
      expect(response.body.result.serverInfo.version).toBe('1.0.0');
    });

    it('should accept initialize without params', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
        })
        .expect(200);

      expect(response.body.result.protocolVersion).toBe('2025-06-18');
      expect(response.body.result.serverInfo.name).toBe('Synjar MCP Server');
    });

    it('should return 404 for initialize with non-existent token', async () => {
      const nonExistentToken = 'b'.repeat(64);

      const response = await request(app.getHttpServer())
        .post(`/mcp/${nonExistentToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-id',
          method: 'initialize',
        })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for initialize with invalid token format', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${encodeURIComponent('invalid-token')}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-id',
          method: 'initialize',
        })
        .expect(400);

      expect(response.body.error.message).toBe('Invalid token format');
    });
  });

  // ==========================================================================
  // Tools List Method Tests
  // ==========================================================================

  describe('POST /mcp/:token method: tools/list', () => {
    it('should return list of available tools with schemas', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: `list-${uuidv4()}`,
          method: 'tools/list',
        })
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBeDefined();
      expect(response.body.result).toBeDefined();
      expect(response.body.result.tools).toBeInstanceOf(Array);

      // Should have synjar_search tool
      const searchTool = response.body.result.tools.find(
        (t: { name: string }) => t.name === 'synjar_search',
      );
      expect(searchTool).toBeDefined();

      // Verify tool description
      expect(searchTool.description).toContain('Search the Synjar knowledge base');

      // Verify input schema
      expect(searchTool.inputSchema).toBeDefined();
      expect(searchTool.inputSchema.type).toBe('object');
      expect(searchTool.inputSchema.properties).toBeDefined();
      expect(searchTool.inputSchema.properties.query).toBeDefined();
      expect(searchTool.inputSchema.properties.limit).toBeDefined();
      expect(searchTool.inputSchema.properties.tags).toBeDefined();
      expect(searchTool.inputSchema.required).toContain('query');
    });

    it('should include allowed tags in tool description when link has tags', async () => {
      // Create a separate link with tags for this test
      const linkWithTags = await publicLinkService.create(testWorkspaceId, testUserId, {
        name: 'Link With Tags',
        allowedTags: ['docs', 'api'],
      });

      const response = await request(app.getHttpServer())
        .post(`/mcp/${linkWithTags.token}`)
        .send({
          jsonrpc: '2.0',
          id: 'tags-test',
          method: 'tools/list',
        })
        .expect(200);

      const searchTool = response.body.result.tools.find(
        (t: { name: string }) => t.name === 'synjar_search',
      );

      // Link was created with allowedTags: ['docs', 'api']
      expect(searchTool.description).toContain('docs');
      expect(searchTool.description).toContain('api');
    });

    it('should return 404 for tools/list with non-existent token', async () => {
      const nonExistentToken = 'c'.repeat(64);

      const response = await request(app.getHttpServer())
        .post(`/mcp/${nonExistentToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-id',
          method: 'tools/list',
        })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  // ==========================================================================
  // Method Routing Tests
  // ==========================================================================

  describe('POST /mcp/:token - method routing', () => {
    it('should return -32601 for unknown methods', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 'unknown-method-test',
          method: 'unknown/method',
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32601);
      expect(response.body.error.message).toContain('Method not found');
    });

    it('should handle tools/call method (existing functionality)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 'call-test',
          method: 'tools/call',
          params: {
            name: 'synjar_search',
            arguments: {
              query: 'test query',
            },
          },
        })
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content).toBeInstanceOf(Array);
    });
  });

  // ==========================================================================
  // JSON-RPC Validation Tests
  // ==========================================================================

  describe('JSON-RPC request validation', () => {
    it('should reject requests without jsonrpc: 2.0', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          id: 'test',
          method: 'initialize',
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32600);
      expect(response.body.error.message).toContain('JSON-RPC version');
    });

    it('should reject requests without id', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          method: 'initialize',
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32600);
      expect(response.body.error.message).toContain('Invalid request ID');
    });

    it('should reject requests without method', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 'test',
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32600);
      expect(response.body.error.message).toContain('Invalid method');
    });

    it('should accept numeric id', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 42,
          method: 'initialize',
        })
        .expect(200);

      expect(response.body.id).toBe(42);
    });

    it('should accept string id', async () => {
      const requestId = `string-id-${uuidv4()}`;

      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: requestId,
          method: 'initialize',
        })
        .expect(200);

      expect(response.body.id).toBe(requestId);
    });
  });
});
