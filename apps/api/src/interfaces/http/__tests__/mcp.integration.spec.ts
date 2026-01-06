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
 * SSE response structure with event and id fields
 */
interface SseResponse {
  event?: string;
  id?: string;
  data: unknown;
}

/**
 * Parse SSE response body to extract full SSE structure
 * SSE format: "event: message\nid: <uuid>\ndata: {...}\n\n"
 */
function parseSseResponse(text: string): SseResponse {
  const lines = text.split('\n');
  const result: SseResponse = { data: null };

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      result.event = line.substring(7);
    } else if (line.startsWith('id: ')) {
      result.id = line.substring(4);
    } else if (line.startsWith('data: ')) {
      result.data = JSON.parse(line.substring(6));
    }
  }

  return result;
}

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
 * - POST /mcp/:token with method: 'tools/list' - returns available tools (search, fetch)
 * - GET /mcp/:token - returns 200 OK health check (required by ChatGPT)
 *
 * Related:
 * - docs/specifications/2026-01-05-mcp-streamable-http-chatgpt.md
 * - docs/specifications/2026-01-06-mcp-chatgpt-compatibility.md
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
  // GET Handler Tests - Health check (200 OK) for ChatGPT compatibility
  // ==========================================================================

  describe('GET /mcp/:token - Health check', () => {
    it('should return 200 OK with server info for GET requests', async () => {
      const response = await request(app.getHttpServer())
        .get(`/mcp/${testPublicLink.token}`)
        .expect(200);

      expect(response.body).toEqual({
        name: 'Synjar MCP Server',
        version: '1.0.0',
        protocolVersion: '2025-06-18',
        status: 'ok',
        message: 'Use POST for JSON-RPC requests',
      });
    });

    it('should return 200 OK for GET requests with invalid token (no enumeration)', async () => {
      // Invalid token should still return 200, not 400 or 404
      // This prevents token enumeration via different responses
      const invalidToken = 'a'.repeat(64);

      const response = await request(app.getHttpServer())
        .get(`/mcp/${invalidToken}`)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.name).toBe('Synjar MCP Server');
    });

    it('should return 200 OK for GET requests with malformed token', async () => {
      // Even malformed tokens should return 200 for GET (health check)
      const malformedToken = 'not-a-valid-token';

      const response = await request(app.getHttpServer())
        .get(`/mcp/${encodeURIComponent(malformedToken)}`)
        .expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  // ==========================================================================
  // Initialize Method Tests
  // ==========================================================================

  describe('POST /mcp/:token method: initialize', () => {
    it('should return server capabilities and protocol version as SSE', async () => {
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
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBeDefined();
      expect(body.result).toBeDefined();

      const result = body.result as Record<string, unknown>;
      // Verify protocol version
      expect(result.protocolVersion).toBe('2025-06-18');

      // Verify capabilities (tools capability enabled)
      expect(result.capabilities).toBeDefined();
      expect((result.capabilities as Record<string, unknown>).tools).toBeDefined();

      // Verify server info
      expect(result.serverInfo).toBeDefined();
      expect((result.serverInfo as Record<string, unknown>).name).toBe('Synjar MCP Server');
      expect((result.serverInfo as Record<string, unknown>).version).toBe('1.0.0');
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      const result = body.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe('2025-06-18');
      expect((result.serverInfo as Record<string, unknown>).name).toBe('Synjar MCP Server');
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect(body.error).toBeDefined();
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).message).toBe('Invalid token format');
    });
  });

  // ==========================================================================
  // Protocol Version Negotiation Tests (C1)
  // ==========================================================================

  describe('Protocol Version Negotiation', () => {
    it('should accept supported version 2024-11-05 and respond with that version', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: `init-${uuidv4()}`,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        })
        .expect(200);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      const result = body.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe('2024-11-05');
    });

    it('should accept supported version 2025-03-26 and respond with that version', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: `init-${uuidv4()}`,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        })
        .expect(200);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      const result = body.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe('2025-03-26');
    });

    it('should accept supported version 2025-11-25 and respond with that version', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: `init-${uuidv4()}`,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        })
        .expect(200);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      const result = body.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe('2025-11-25');
    });

    it('should reject unsupported future version 2026-01-01 with 400 error', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: `init-${uuidv4()}`,
          method: 'initialize',
          params: {
            protocolVersion: '2026-01-01',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        })
        .expect(400);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect(body.error).toBeDefined();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe(-32602);
      expect(error.message).toContain('Unsupported protocol version');
    });

    it('should reject unsupported old version 2024-01-01 with 400 error', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: `init-${uuidv4()}`,
          method: 'initialize',
          params: {
            protocolVersion: '2024-01-01',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        })
        .expect(400);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect(body.error).toBeDefined();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe(-32602);
      expect(error.message).toContain('Unsupported protocol version');
    });

    it('should default to 2025-06-18 when protocolVersion param is not provided', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: `init-${uuidv4()}`,
          method: 'initialize',
          params: {
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        })
        .expect(200);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      const result = body.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe('2025-06-18');
    });

    it('should include list of supported versions in error message for unsupported version', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: `init-${uuidv4()}`,
          method: 'initialize',
          params: {
            protocolVersion: '2023-01-01',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        })
        .expect(400);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      const error = body.error as Record<string, unknown>;
      expect(error.message).toContain('2024-11-05');
      expect(error.message).toContain('2025-03-26');
      expect(error.message).toContain('2025-06-18');
      expect(error.message).toContain('2025-11-25');
    });
  });

  // ==========================================================================
  // Notifications Tests (MCP Streamable HTTP)
  // ==========================================================================

  describe('POST /mcp/:token method: notifications/*', () => {
    it('should return 202 Accepted for notifications/initialized', async () => {
      // Per MCP Streamable HTTP spec, notifications should return 202 Accepted with no body
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          // No 'id' field - this is a notification
          method: 'notifications/initialized',
          params: {},
        })
        .expect(202);

      // 202 Accepted should have empty body
      expect(response.text).toBe('');
    });

    it('should return 202 Accepted for any notifications/* method', async () => {
      // Even unknown notifications should be accepted silently
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: { progress: 50 },
        })
        .expect(202);

      expect(response.text).toBe('');
    });

    it('should return 202 Accepted for notifications/cancelled', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          method: 'notifications/cancelled',
          params: { requestId: 'some-request-id', reason: 'user cancelled' },
        })
        .expect(202);

      expect(response.text).toBe('');
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBeDefined();
      expect(body.result).toBeDefined();

      const result = body.result as { tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> };
      expect(result.tools).toBeInstanceOf(Array);

      // Should have 2 tools: search, fetch
      expect(result.tools).toHaveLength(2);

      // Verify 'search' tool (ChatGPT standard)
      const searchTool = result.tools.find((t) => t.name === 'search');
      expect(searchTool).toBeDefined();
      expect(searchTool!.description).toContain('Search the knowledge base');
      expect((searchTool!.inputSchema.properties as Record<string, unknown>).query).toBeDefined();
      expect(searchTool!.inputSchema.required).toContain('query');

      // Verify 'fetch' tool (ChatGPT standard)
      const fetchTool = result.tools.find((t) => t.name === 'fetch');
      expect(fetchTool).toBeDefined();
      expect(fetchTool!.description).toContain('Fetch a specific document');
      expect((fetchTool!.inputSchema.properties as Record<string, unknown>).id).toBeDefined();
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      const result = body.result as { tools: Array<{ name: string; description: string }> };

      // Check 'search' tool has tags
      const searchTool = result.tools.find((t) => t.name === 'search');
      expect(searchTool!.description).toContain('docs');
      expect(searchTool!.description).toContain('api');
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect(body.error).toBeDefined();
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).code).toBe(-32601);
      expect((body.error as Record<string, unknown>).message).toContain('Method not found');
    });

    it('should handle tools/call with search', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 'search-test',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              query: 'test query',
            },
          },
        })
        .expect(200);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect(body.jsonrpc).toBe('2.0');
      expect(body.result).toBeDefined();
      expect((body.result as Record<string, unknown>).content).toBeInstanceOf(Array);
    });

    it('should handle tools/call with fetch', async () => {
      // Fetch requires a valid document ID, but without documents it should return error
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 'fetch-test',
          method: 'tools/call',
          params: {
            name: 'fetch',
            arguments: {
              id: uuidv4(), // Non-existent document
            },
          },
        })
        .expect(400);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).code).toBe(-32602);
      expect((body.error as Record<string, unknown>).message).toContain('Document not found');
    });

    it('should return error for unknown tool name', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 'unknown-tool-test',
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {},
          },
        })
        .expect(400);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).code).toBe(-32602);
      expect((body.error as Record<string, unknown>).message).toContain('Unknown tool');
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
            name: 'search',
            arguments: { query: 'a'.repeat(257) },
          },
        });

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).code).toBe(-32602);
      expect((body.error as Record<string, unknown>).message).toContain('256');
    });

    it('should not be vulnerable to prototype pollution', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              query: 'test',
              __proto__: { polluted: true },
            },
          },
        });

      // Should not crash and should process normally
      expect(response.status).toBe(200);
      expect(({} as unknown as { polluted?: boolean }).polluted).toBeUndefined();
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).code).toBe(-32600);
      expect((body.error as Record<string, unknown>).message).toContain('JSON-RPC version');
    });

    it('should reject requests without id', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          method: 'initialize',
        })
        .expect(400);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).code).toBe(-32600);
      expect((body.error as Record<string, unknown>).message).toContain('Invalid request ID');
    });

    it('should reject requests without method', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 'test',
        })
        .expect(400);

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).code).toBe(-32600);
      expect((body.error as Record<string, unknown>).message).toContain('Invalid method');
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect(body.id).toBe(42);
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

      const body = parseSseResponse(response.text).data as Record<string, unknown>;
      expect(body.id).toBe(requestId);
    });
  });

  // ==========================================================================
  // Response Headers Tests (C3)
  // ==========================================================================

  describe('Response Headers', () => {
    it('should include X-Accel-Buffering: no header in successful response', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${testPublicLink.token}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-header',
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

      // Verify X-Accel-Buffering header is set to 'no' (required for nginx reverse proxy)
      expect(response.headers['x-accel-buffering']).toBe('no');
    });

    it('should include X-Accel-Buffering: no header in error response', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${encodeURIComponent('invalid-token')}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-header-error',
          method: 'initialize',
        })
        .expect(400);

      // Verify X-Accel-Buffering header is set even for error responses
      expect(response.headers['x-accel-buffering']).toBe('no');
    });
  });

  // ==========================================================================
  // SSE Format Verification Tests (C2)
  // ==========================================================================

  describe('SSE Format Verification', () => {
    it('should include event: message field in success response', async () => {
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
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      const sse = parseSseResponse(response.text);
      expect(sse.event).toBe('message');
    });

    it('should include UUID id field in success response', async () => {
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
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      const sse = parseSseResponse(response.text);
      expect(sse.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should include event: message field in error response', async () => {
      const nonExistentToken = 'b'.repeat(64);

      const response = await request(app.getHttpServer())
        .post(`/mcp/${nonExistentToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-id',
          method: 'initialize',
        })
        .expect(404);

      const sse = parseSseResponse(response.text);
      expect(sse.event).toBe('message');
    });
  });
});
