import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaClient, Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
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
 * MCP Prototype Pollution Prevention Tests (TS-011 Enhanced)
 *
 * This test suite validates that the MCP endpoint is protected against
 * prototype pollution attacks and verifies that Object.prototype is never
 * polluted regardless of the attack vector.
 *
 * Security Context:
 * - Modern JSON parsers (Node.js JSON.parse, express body-parser) handle `__proto__`
 *   specially for security - they strip it or don't set it as own property
 * - The `constructor` and `prototype` keys ARE preserved and must be explicitly blocked
 * - The primary security goal is ensuring Object.prototype is NEVER polluted
 *
 * Test Payloads:
 * - { __proto__: { admin: true } } - Stripped by JSON parser (fails at query validation)
 * - { constructor: { prototype: { admin: true } } } - Blocked by our check
 * - { prototype: { admin: true } } - Blocked by our check
 *
 * Defense Layers:
 * 1. JSON parser security (strips __proto__)
 * 2. Application-level check (blocks constructor, prototype)
 * 3. Query validation (catches malformed requests)
 */
describe('MCP Prototype Pollution Prevention (TS-011 Enhanced)', () => {
  let app: INestApplication;
  let prismaSuperuser: PrismaClient;

  // Test data
  let user: { id: string; email: string };
  let workspace: { id: string; name: string; createdById: string };
  let validToken: string;

  beforeAll(async () => {
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

    // Use superuser for setup/teardown (bypasses RLS)
    prismaSuperuser = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL_MIGRATE ||
            process.env.DATABASE_URL ||
            'postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public',
        },
      },
    });
    await prismaSuperuser.$connect();
  });

  afterAll(async () => {
    await prismaSuperuser.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Create test user
    user = await prismaSuperuser.user.create({
      data: {
        id: uuidv4(),
        email: `prototype-pollution-test-${uuidv4()}@test.com`,
        passwordHash: 'hash',
        name: 'Prototype Pollution Test User',
      },
    });

    // Create workspace
    workspace = await prismaSuperuser.workspace.create({
      data: {
        id: uuidv4(),
        name: `Prototype Pollution Test Workspace ${uuidv4()}`,
        createdById: user.id,
        members: {
          create: { userId: user.id, role: Role.OWNER },
        },
      },
    });

    // Create valid PublicLink
    validToken = randomBytes(32).toString('hex');
    await prismaSuperuser.publicLink.create({
      data: {
        id: uuidv4(),
        workspaceId: workspace.id,
        token: validToken,
        name: 'Prototype Pollution Test Link',
        allowedTags: [],
        isActive: true,
      },
    });
  });

  afterEach(async () => {
    // Cleanup using superuser (bypasses RLS)
    try {
      // Delete in order respecting foreign keys
      await prismaSuperuser.usageDaily.deleteMany({
        where: { workspaceId: workspace?.id },
      });
      await prismaSuperuser.usageEvent.deleteMany({
        where: { workspaceId: workspace?.id },
      });
      await prismaSuperuser.publicLink.deleteMany({
        where: { workspaceId: workspace?.id },
      });
      await prismaSuperuser.workspaceMember.deleteMany({
        where: { workspaceId: workspace?.id },
      });
      await prismaSuperuser.workspace.deleteMany({
        where: { id: workspace?.id },
      });
      await prismaSuperuser.user.deleteMany({
        where: { id: user?.id },
      });
    } catch (error) {
      console.warn('Cleanup failed:', (error as Error).message);
    }
  });

  describe('Prototype Pollution Attack Prevention', () => {
    /**
     * CRITICAL TEST: Verify all prototype pollution payloads are rejected
     * and Object.prototype is NOT polluted after the attacks.
     *
     * Test covers multiple attack vectors that all result in 400 errors
     * (either from explicit blocking or from validation failures).
     *
     * The key assertion is that Object.prototype is NEVER polluted.
     */
    it('should prevent prototype pollution attacks', async () => {
      // Attack payloads - all should result in 400 errors
      const pollutionPayloads: Record<string, unknown>[] = [
        { __proto__: { admin: true } },
        { constructor: { prototype: { admin: true } } },
        { prototype: { admin: true } },
      ];

      for (const payload of pollutionPayloads) {
        const response = await request(app.getHttpServer())
          .post(`/mcp/${validToken}`)
          .send({
            jsonrpc: '2.0',
            id: 'test',
            method: 'tools/call',
            params: {
              name: 'search',
              arguments: payload,
            },
          })
          .expect(400);

        // Verify JSON-RPC error response structure
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32602);
        // Note: __proto__ is stripped by JSON parser, so fails at "Query must be a string"
        // constructor/prototype are explicitly blocked with "Invalid arguments"
      }

      // CRITICAL: Verify prototype was NOT polluted
      const obj = {};
      expect((obj as Record<string, unknown>).admin).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('admin');
    });

    /**
     * Test that constructor pollution attempt is explicitly rejected.
     *
     * Unlike __proto__, the "constructor" key IS preserved by JSON parsers
     * and must be explicitly blocked by our application code.
     */
    it('should reject constructor pollution attempt', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-constructor',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              constructor: { prototype: { polluted: true } },
            },
          },
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32602);
      expect(response.body.error.message).toBe('Invalid arguments');

      // Verify no pollution occurred
      const testObj = {};
      expect((testObj as Record<string, unknown>).polluted).toBeUndefined();
    });

    /**
     * Test that prototype property pollution attempt is explicitly rejected.
     *
     * The "prototype" key IS preserved by JSON parsers and must be
     * explicitly blocked by our application code.
     */
    it('should reject prototype property pollution attempt', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-prototype',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              prototype: { admin: true },
            },
          },
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32602);
      expect(response.body.error.message).toBe('Invalid arguments');

      // Verify no pollution occurred
      const testObj = {};
      expect((testObj as Record<string, unknown>).admin).toBeUndefined();
    });

    /**
     * Test that __proto__ pollution attempt fails at validation.
     *
     * Modern JSON parsers strip __proto__ for security, so the payload
     * becomes empty and fails at "Query must be a string" validation.
     * The key assertion is that pollution does NOT occur.
     */
    it('should not be polluted by __proto__ attack (stripped by JSON parser)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-proto',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              __proto__: { admin: true, isAdmin: true, role: 'superuser' },
            },
          },
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32602);
      // __proto__ is stripped by JSON parser, so fails at query validation
      expect(response.body.error.message).toBe('Query must be a string');

      // CRITICAL: Verify no pollution occurred
      const testObj = {};
      expect((testObj as Record<string, unknown>).admin).toBeUndefined();
      expect((testObj as Record<string, unknown>).isAdmin).toBeUndefined();
      expect((testObj as Record<string, unknown>).role).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('admin');
      expect(Object.prototype).not.toHaveProperty('isAdmin');
      expect(Object.prototype).not.toHaveProperty('role');
    });

    /**
     * Test that valid requests still work after pollution attempts.
     *
     * This ensures that rejected pollution attempts don't break
     * subsequent valid requests.
     */
    it('should still accept valid requests after pollution attempts', async () => {
      // First, attempt constructor pollution (should fail with explicit rejection)
      await request(app.getHttpServer())
        .post(`/mcp/${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'pollution-attempt',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: { constructor: { prototype: { admin: true } } },
          },
        })
        .expect(400);

      // Then, make a valid request (should succeed)
      const validResponse = await request(app.getHttpServer())
        .post(`/mcp/${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'valid-request',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: { query: 'test search query' },
          },
        });

      // Valid requests should succeed (200 or 201)
      expect([200, 201]).toContain(validResponse.status);
      expect(validResponse.body.jsonrpc).toBe('2.0');
      expect(validResponse.body.id).toBe('valid-request');
      expect(validResponse.body.result).toBeDefined();
    });

    /**
     * Test combined constructor pollution with valid query is rejected.
     *
     * Even when a valid query is provided, the presence of "constructor"
     * key should cause immediate rejection.
     */
    it('should reject combined constructor pollution with valid query', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-combined-constructor',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              query: 'valid search query',
              constructor: { prototype: { admin: true } },
            },
          },
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32602);
      expect(response.body.error.message).toBe('Invalid arguments');

      // Verify no pollution occurred
      const testObj = {};
      expect((testObj as Record<string, unknown>).admin).toBeUndefined();
    });

    /**
     * Test combined prototype pollution with valid query is rejected.
     */
    it('should reject combined prototype pollution with valid query', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-combined-prototype',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              query: 'valid search query',
              prototype: { admin: true },
            },
          },
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32602);
      expect(response.body.error.message).toBe('Invalid arguments');

      // Verify no pollution occurred
      const testObj = {};
      expect((testObj as Record<string, unknown>).admin).toBeUndefined();
    });

    /**
     * Test that __proto__ with valid query is safely ignored.
     *
     * Since JSON parser strips __proto__, a payload like
     * { query: 'test', __proto__: {...} } becomes just { query: 'test' }
     * which is a valid request. The key assertion is no pollution occurs.
     */
    it('should safely ignore __proto__ when combined with valid query (stripped by JSON parser)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/mcp/${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-combined-proto',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              query: 'valid search query',
              __proto__: { admin: true },
            },
          },
        });

      // Request succeeds because __proto__ is stripped by JSON parser
      expect([200, 201]).toContain(response.status);
      expect(response.body.result).toBeDefined();

      // CRITICAL: Verify no pollution occurred even though request succeeded
      const testObj = {};
      expect((testObj as Record<string, unknown>).admin).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('admin');
    });
  });

  describe('Object.prototype Integrity', () => {
    /**
     * Verify Object.prototype integrity after all tests.
     * This is a meta-test to ensure no test leaked pollution.
     */
    it('should have clean Object.prototype after all tests', () => {
      // Check common pollution targets
      const pollutionTargets = [
        'admin',
        'isAdmin',
        'role',
        'polluted',
        'elevated',
        'superuser',
        'authorized',
      ];

      for (const target of pollutionTargets) {
        expect(Object.prototype).not.toHaveProperty(target);
        const freshObj = {};
        expect((freshObj as Record<string, unknown>)[target]).toBeUndefined();
      }
    });

    /**
     * Verify that Object.prototype methods are intact.
     */
    it('should have intact Object.prototype methods', () => {
      expect(typeof Object.prototype.hasOwnProperty).toBe('function');
      expect(typeof Object.prototype.toString).toBe('function');
      expect(typeof Object.prototype.valueOf).toBe('function');
      expect(typeof Object.prototype.isPrototypeOf).toBe('function');
      expect(typeof Object.prototype.propertyIsEnumerable).toBe('function');
    });
  });
});
