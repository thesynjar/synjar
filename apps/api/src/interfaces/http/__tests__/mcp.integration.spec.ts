import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { Request, Response } from 'express';
import { AppModule } from '../../../app.module';
import { PublicLinkService } from '../../../application/public-link/public-link.service';
import { v4 as uuidv4 } from 'uuid';
import { EMBEDDINGS_SERVICE } from '../../../domain/document/embeddings.port';

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
 *
 * Per-Test Isolation: Each test creates its own unique tenant context (user, workspace, public link)
 * following RLS isolation principles from CORE-RULES.md. No global cleanup needed.
 */
describe('MCP Streamable HTTP (initialize, tools/list, GET 405)', () => {
  let app: INestApplication;
  let publicLinkService: PublicLinkService;

  // Per-test context - recreated for each test
  let testAccessToken: string;
  let testWorkspaceId: string;
  let testUserId: string;
  let testPublicLink: { id: string; token: string };

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

    // Apply same middleware as production (main.ts)
    // Security: Limit MCP request body size to prevent DoS attacks (10KB)
    app.use('/mcp', json({ limit: '10kb' }));

    // Increase body size limits for document uploads (excludes /mcp routes)
    app.use((req: Request, res: Response, next: () => void) => {
      if (req.path.startsWith('/mcp')) {
        return next();
      }
      return json({ limit: '10mb' })(req, res, next);
    });

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
    publicLinkService = moduleFixture.get<PublicLinkService>(PublicLinkService);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Per-test tenant context setup
   * Creates unique user, workspace, and public link for each test
   * following RLS isolation principles (no global cleanup needed)
   */
  beforeEach(async () => {
    // Create unique email per test to ensure complete isolation
    const uniqueEmail = `mcp-test-${Date.now()}-${uuidv4().substring(0, 8)}@test.local`;

    // Create test user and workspace via HTTP API
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: uniqueEmail,
        password: 'TestPass123!@#',
        workspaceName: `Test Workspace ${uuidv4().substring(0, 8)}`,
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
      name: `MCP Test Link ${uuidv4().substring(0, 8)}`,
      allowedTags: [],
    });
  });

  // No afterEach cleanup needed - RLS isolation ensures no conflicts between tests

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
  // Edge Case Tests (M3)
  // ==========================================================================

  describe('Edge cases and security', () => {
    // Note: Rate limiting test is skipped because test environment has rate limit = 10000
    // See mcp-rate-limit.integration.spec.ts for rate limiting architecture tests
    it.skip('should enforce rate limit per token', async () => {
      // Send 101 requests rapidly - rate limit is 100 req/min per token
      const requests = Array(101)
        .fill(null)
        .map(() =>
          request(app.getHttpServer())
            .post(`/mcp/${testPublicLink.token}`)
            .send({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
        );
      const responses = await Promise.all(requests);
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should reject query longer than 256 characters', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'synjar_search',
            arguments: { query: 'a'.repeat(257) },
          },
        });

      expect(response.body.error.code).toBe(-32602);
      expect(response.body.error.message).toContain('256');
    });

    it('should not be vulnerable to prototype pollution', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'synjar_search',
            arguments: {
              query: 'test',
              __proto__: { polluted: true },
            },
          },
        });

      // Should not crash and should process normally
      expect(response.status).toBe(200);
      expect(({} as any).polluted).toBeUndefined();
    });

    it('should reject requests larger than 10KB', async () => {
      const largeBody = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { data: 'x'.repeat(15000) },
      };
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send(largeBody);

      expect(response.status).toBe(413);
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
