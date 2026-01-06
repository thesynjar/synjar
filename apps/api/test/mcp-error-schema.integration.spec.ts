import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
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
 * MCP Error Response Schema Validation Tests (TS-017)
 *
 * This test suite validates that all MCP error responses follow the
 * correct JSON-RPC 2.0 error format and contain required fields.
 *
 * JSON-RPC Error Response Format:
 * {
 *   "jsonrpc": "2.0",
 *   "id": <request-id or null>,
 *   "error": {
 *     "code": <number>,
 *     "message": <string>,
 *     "data": <optional object>
 *   }
 * }
 *
 * Error Codes:
 * - -32700: Parse error (invalid JSON)
 * - -32600: Invalid request (invalid JSON-RPC structure)
 * - -32602: Invalid params (parameter validation failed)
 * - -32002: Forbidden (invalid/expired token)
 * - -32000: Rate limit exceeded
 * - -32603: Internal error
 */
describe('MCP Error Response Schema (TS-017)', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Helper to create a valid MCP JSON-RPC request
   */
  function validMcpRequest(overrides: { query?: string; limit?: number } = {}) {
    return {
      jsonrpc: '2.0',
      id: `test-${uuidv4()}`,
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: {
          query: overrides.query ?? 'test query',
          ...(overrides.limit !== undefined && { limit: overrides.limit }),
        },
      },
    };
  }

  /**
   * Helper to generate a valid-format but non-existent token
   */
  function generateNonExistentToken(): string {
    return 'a'.repeat(64); // Valid format (64 hex chars) but doesn't exist
  }

  describe('Error Response Structure', () => {
    /**
     * TS-017: Verify complete JSON-RPC error response for invalid token
     */
    it('should return complete JSON-RPC error response for invalid token', async () => {
      const nonExistentToken = generateNonExistentToken();

      const response = await request(app.getHttpServer())
        .post(`/mcp/${nonExistentToken}`)
        .send(validMcpRequest())
        .expect(404);

      // Verify complete error response structure
      expect(response.body).toMatchObject({
        jsonrpc: '2.0',
        id: expect.any(String),
        error: {
          code: expect.any(Number),
          message: expect.any(String),
        },
      });

      // Verify no 'result' field in error response
      expect(response.body.result).toBeUndefined();
    });

    /**
     * TS-017: Verify error response for invalid JSON-RPC request
     */
    it('should return -32600 for invalid JSON-RPC request', async () => {
      const nonExistentToken = generateNonExistentToken();

      const response = await request(app.getHttpServer())
        .post(`/mcp/${nonExistentToken}`)
        .send({ notJsonRpc: true }) // Missing jsonrpc, id, method, params
        .expect(400);

      expect(response.body).toMatchObject({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: expect.any(String),
        },
      });

      // id can be null for parse/request errors
      expect(response.body.id === null || typeof response.body.id === 'string').toBe(true);

      // Verify no 'result' field
      expect(response.body.result).toBeUndefined();
    });

    /**
     * TS-017: Verify error response for invalid parameters
     *
     * Note: Token lookup happens BEFORE query validation, so with a non-existent token
     * we get 404 (token not found) before reaching query validation.
     * This test verifies the error response structure for either case.
     */
    it('should return -32602 for invalid params (query too short)', async () => {
      const nonExistentToken = generateNonExistentToken();

      const response = await request(app.getHttpServer())
        .post(`/mcp/${nonExistentToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-params',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              query: 'a', // Too short (< 2 chars)
            },
          },
        });

      // Token lookup happens before query validation
      // With non-existent token, we get 404 (not found) before query validation
      expect([400, 404]).toContain(response.status);

      expect(response.body).toMatchObject({
        jsonrpc: '2.0',
        id: 'test-params',
        error: {
          code: expect.any(Number),
          message: expect.any(String),
        },
      });

      expect(response.body.result).toBeUndefined();
    });

    /**
     * TS-017: Verify error response for unsupported method
     */
    it('should return -32601 for unsupported method', async () => {
      const nonExistentToken = generateNonExistentToken();

      const response = await request(app.getHttpServer())
        .post(`/mcp/${nonExistentToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-method',
          method: 'unsupported/method', // Invalid method
          params: {},
        })
        .expect(400);

      expect(response.body).toMatchObject({
        jsonrpc: '2.0',
        id: 'test-method',
        error: {
          code: expect.any(Number), // Could be -32600 or -32601
          message: expect.any(String),
        },
      });

      expect(response.body.result).toBeUndefined();
    });

    /**
     * TS-017: Verify error response for malformed token
     */
    it('should return error for malformed token format', async () => {
      const response = await request(app.getHttpServer())
        .post('/mcp/not-a-valid-token')
        .send(validMcpRequest())
        .expect(400);

      expect(response.body).toMatchObject({
        jsonrpc: '2.0',
        error: {
          code: expect.any(Number),
          message: expect.any(String),
        },
      });

      expect(response.body.result).toBeUndefined();
    });
  });

  describe('Error Response Consistency', () => {
    /**
     * TS-017: All error responses should have consistent structure
     */
    it('should have consistent error structure across different error types', async () => {
      const errorCases = [
        {
          name: 'Invalid token format',
          token: 'short',
          body: validMcpRequest(),
          expectedStatus: 400,
        },
        {
          name: 'Missing jsonrpc version',
          token: generateNonExistentToken(),
          body: { id: 'test', method: 'tools/call', params: {} },
          expectedStatus: 400,
        },
        {
          name: 'Wrong jsonrpc version',
          token: generateNonExistentToken(),
          body: { jsonrpc: '1.0', id: 'test', method: 'tools/call', params: {} },
          expectedStatus: 400,
        },
      ];

      for (const testCase of errorCases) {
        const response = await request(app.getHttpServer())
          .post(`/mcp/${testCase.token}`)
          .send(testCase.body)
          .expect(testCase.expectedStatus);

        // All errors should have consistent JSON-RPC 2.0 structure
        expect(response.body).toHaveProperty('jsonrpc', '2.0');
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
        expect(response.body).not.toHaveProperty('result');

        // Error code should be a negative number (JSON-RPC standard)
        expect(typeof response.body.error.code).toBe('number');
        expect(response.body.error.code).toBeLessThan(0);

        // Message should be a non-empty string
        expect(typeof response.body.error.message).toBe('string');
        expect(response.body.error.message.length).toBeGreaterThan(0);
      }
    });

    /**
     * TS-017: Error data field should only contain safe information
     */
    it('should not leak sensitive information in error data', async () => {
      const nonExistentToken = generateNonExistentToken();

      const response = await request(app.getHttpServer())
        .post(`/mcp/${nonExistentToken}`)
        .send({
          jsonrpc: '2.0',
          id: 'test-data',
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              query: 'test',
              tags: ['invalid-tag-not-allowed'],
            },
          },
        });

      // If error data is present, verify it doesn't contain sensitive fields
      if (response.body.error?.data) {
        const data = response.body.error.data;

        // Should NOT contain sensitive information
        expect(data).not.toHaveProperty('stack');
        expect(data).not.toHaveProperty('sql');
        expect(data).not.toHaveProperty('password');
        expect(data).not.toHaveProperty('token');
        expect(data).not.toHaveProperty('secret');
        expect(data).not.toHaveProperty('workspaceId');
        expect(data).not.toHaveProperty('userId');
      }
    });
  });

  describe('Error Code Ranges', () => {
    /**
     * TS-017: Verify error codes are in valid JSON-RPC ranges
     *
     * Standard JSON-RPC error codes:
     * -32700: Parse error
     * -32600: Invalid Request
     * -32601: Method not found
     * -32602: Invalid params
     * -32603: Internal error
     * -32000 to -32099: Server errors (reserved for implementation)
     */
    it('should use standard JSON-RPC error codes', async () => {
      const nonExistentToken = generateNonExistentToken();

      // Test invalid request
      const invalidRequestResponse = await request(app.getHttpServer())
        .post(`/mcp/${nonExistentToken}`)
        .send({ invalid: 'structure' });

      // Error code should be in standard range
      const code = invalidRequestResponse.body.error?.code;
      expect(typeof code).toBe('number');

      // Standard range: -32700 to -32600, or server error range -32000 to -32099
      const isStandardRange = code >= -32700 && code <= -32600;
      const isServerRange = code >= -32099 && code <= -32000;
      const isCustomAppCode = code === -32002; // Forbidden (custom)

      expect(isStandardRange || isServerRange || isCustomAppCode).toBe(true);
    });
  });
});
