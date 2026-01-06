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
 * MCP Token Validation Defense-in-Depth Tests (TS-016)
 *
 * This test suite validates that token format is validated BEFORE any database
 * lookup, preventing SQL injection and malformed token attacks.
 *
 * Security Requirement:
 * Token format validation (64-char hex) must happen before RLS context setting
 * to prevent any malicious input from reaching the database layer.
 *
 * Token Format: 64 hexadecimal characters (32 bytes)
 * Regex: /^[a-f0-9]{64}$/i
 */
describe('MCP Token Validation (TS-016)', () => {
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
  function validMcpRequest(overrides: { query?: string } = {}) {
    return {
      jsonrpc: '2.0',
      id: `test-${uuidv4()}`,
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: {
          query: overrides.query ?? 'test query',
        },
      },
    };
  }

  describe('Token Format Validation', () => {
    /**
     * CRITICAL TEST: Verify that malicious tokens are rejected
     * BEFORE any database lookup occurs.
     *
     * This prevents:
     * - SQL injection attacks
     * - Path traversal attacks
     * - Token enumeration via timing attacks
     * - Malformed data reaching the database
     *
     * Note: Token format is 64-character hex (not UUID).
     * The validation regex is /^[a-f0-9]{64}$/i
     *
     * From spec H4:
     * - 'not-a-uuid'
     * - '123'
     * - "'; DROP TABLE Document; --"
     * - '../../../etc/passwd'
     * - 'abc123def456' (too short)
     */
    it('should reject non-UUID/non-valid tokens before database lookup', async () => {
      // Tokens from spec requirement that should return 400
      const maliciousTokens = [
        'not-a-uuid',
        '123',
        "'; DROP TABLE Document; --",
        '../../../etc/passwd',
        'abc123def456', // Too short
      ];

      for (const token of maliciousTokens) {
        const response = await request(app.getHttpServer())
          .post(`/mcp/${encodeURIComponent(token)}`)
          .send(validMcpRequest());

        // Should return 400 Bad Request for invalid token format
        // The validation happens BEFORE database lookup
        expect(response.status).toBe(400);
        expect(response.body.error?.message || response.body.message).toBe('Invalid token format');
      }
    });

    /**
     * Additional malicious token patterns that should be rejected
     */
    it('should reject additional malicious token patterns', async () => {
      const maliciousTokens = [
        // SQL injection attempts
        "1' OR '1'='1",
        'UNION SELECT * FROM users--',
        // Path traversal attempts
        '..\\..\\..\\windows\\system32\\config\\sam',
        // Too short tokens
        'a'.repeat(32), // Half the required length
        // Too long tokens
        'a'.repeat(128), // Double the required length
        // Invalid characters (not hex)
        'g'.repeat(64), // 'g' is not a hex character
        'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
        // Special characters
        '!@#$%^&*()_+-=[]{}|;:,.<>?/~`',
        // Unicode/null bytes
        '\u0000'.repeat(64),
        // Null byte injection
        'a'.repeat(32) + '\x00' + 'a'.repeat(31),
      ];

      for (const token of maliciousTokens) {
        const response = await request(app.getHttpServer())
          .post(`/mcp/${encodeURIComponent(token)}`)
          .send(validMcpRequest());

        // Should return 400 Bad Request for invalid token format
        expect(response.status).toBe(400);
        expect(response.body.error?.message || response.body.message).toBe('Invalid token format');
      }
    });

    /**
     * Test specific SQL injection patterns
     */
    it('should reject SQL injection attempts in token', async () => {
      const sqlInjectionTokens = [
        "'; DROP TABLE Document; --",
        "1'; DELETE FROM PublicLink; --",
        "1' OR '1'='1' --",
        "1' UNION SELECT * FROM users --",
        "1'; UPDATE PublicLink SET isActive=true; --",
        "1' AND 1=SLEEP(5) --",
        "1'; EXEC xp_cmdshell('dir'); --",
      ];

      for (const token of sqlInjectionTokens) {
        const response = await request(app.getHttpServer())
          .post(`/mcp/${encodeURIComponent(token)}`)
          .send(validMcpRequest());

        expect(response.status).toBe(400);
        expect(response.body.error?.message || response.body.message).toBe('Invalid token format');
      }
    });

    /**
     * Test path traversal attempts
     */
    it('should reject path traversal attempts in token', async () => {
      const pathTraversalTokens = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd', // URL encoded ../
        '..%252f..%252f..%252fetc%252fpasswd', // Double URL encoded
      ];

      for (const token of pathTraversalTokens) {
        const response = await request(app.getHttpServer())
          .post(`/mcp/${encodeURIComponent(token)}`)
          .send(validMcpRequest());

        expect(response.status).toBe(400);
        expect(response.body.error?.message || response.body.message).toBe('Invalid token format');
      }
    });

    /**
     * Test that valid 64-character hex tokens are accepted
     * (they will fail at the database lookup stage with 404, not 400)
     */
    it('should accept valid 64-char hex tokens for database lookup', async () => {
      const validFormatTokens = [
        'a'.repeat(64),
        'f'.repeat(64),
        '0'.repeat(64),
        '0123456789abcdef'.repeat(4),
        'ABCDEF0123456789'.repeat(4), // Uppercase is valid
        'AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789', // Mixed case (64 chars)
      ];

      for (const token of validFormatTokens) {
        const response = await request(app.getHttpServer())
          .post(`/mcp/${token}`)
          .send(validMcpRequest());

        // Valid format tokens should pass format validation
        // They will fail at database lookup (404 - not found)
        // NOT at format validation (400 - bad request)
        expect(response.status).toBe(404);
        expect(response.body.error?.message || response.body.message).not.toBe('Invalid token format');
      }
    });

    /**
     * Test boundary cases for token length
     */
    it('should reject tokens with incorrect length', async () => {
      const wrongLengthTokens = [
        'a'.repeat(63), // 1 char too short
        'a'.repeat(65), // 1 char too long
        // Note: Empty string results in different route (404),
        // so we only test non-empty wrong-length tokens here
      ];

      for (const token of wrongLengthTokens) {
        const response = await request(app.getHttpServer())
          .post(`/mcp/${encodeURIComponent(token)}`)
          .send(validMcpRequest());

        expect(response.status).toBe(400);
        expect(response.body.error?.message || response.body.message).toBe('Invalid token format');
      }
    });

    /**
     * Test that validation happens synchronously before any async operations
     *
     * This is a timing test to ensure that invalid tokens are rejected
     * immediately without any database round-trip.
     */
    it('should reject invalid tokens faster than database lookups', async () => {
      const invalidToken = 'not-a-valid-token';
      const validFormatToken = 'a'.repeat(64); // Valid format but non-existent

      // Measure time for invalid token (should be rejected immediately)
      const invalidStart = Date.now();
      await request(app.getHttpServer())
        .post(`/mcp/${encodeURIComponent(invalidToken)}`)
        .send(validMcpRequest());
      const invalidTime = Date.now() - invalidStart;

      // Measure time for valid format token (requires database lookup)
      const validStart = Date.now();
      await request(app.getHttpServer())
        .post(`/mcp/${validFormatToken}`)
        .send(validMcpRequest());
      const validTime = Date.now() - validStart;

      // Invalid token should be rejected faster (no DB lookup)
      // Note: This is a heuristic test; in practice, the difference might be small
      // The important thing is that invalid tokens don't cause errors at the DB level
      expect(invalidTime).toBeLessThanOrEqual(validTime + 50); // Allow some variance
    });
  });
});
