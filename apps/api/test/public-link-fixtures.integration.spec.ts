import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';
import { PublicLinkService } from '../src/application/public-link/public-link.service';

/**
 * Public Link Fixtures Meta-Test (TS-012)
 *
 * This test suite verifies that test fixtures use application services
 * instead of raw Prisma to ensure RLS context, business logic validation,
 * and domain events are properly executed.
 *
 * From Agent Guidelines:
 * > Fixtures MUST use application services (orchestrator, service) instead
 * > of direct Prisma to ensure RLS context, domain events, and business
 * > logic are executed.
 *
 * Why this matters:
 * - PublicLinkService.create() generates cryptographically secure tokens (64 hex chars)
 * - PublicLinkService.create() validates expiration dates
 * - PublicLinkService.create() verifies workspace membership via RLS
 * - Direct Prisma bypasses all business logic (tests pass, production fails)
 *
 * Related: docs/specifications/2026-01-01-13-00-mcp-review-findings.md (C3)
 */
describe('Test Fixtures - PublicLink (Meta-test)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let publicLinkService: PublicLinkService;
  let testAccessToken: string;
  let testWorkspaceId: string;
  let testUserId: string;

  const TEST_EMAIL_DOMAIN = '@public-link-fixtures-test.com';

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
    }).compile();

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

    // Clean up any existing test data before running tests
    await cleanupTestData();

    // Create test user and workspace via HTTP API (production code path)
    // In self-hosted mode, first user becomes admin
    const email = `user-${Date.now()}${TEST_EMAIL_DOMAIN}`;

    // Register user - self-hosted mode returns tokens directly
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

    // Get workspace ID using Bearer token
    const workspacesRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${testAccessToken}`)
      .expect(200);

    testWorkspaceId = workspacesRes.body[0].id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  describe('PublicLinkService.create() behavior verification', () => {
    /**
     * TS-012: Verify fixtures use application services
     *
     * This test verifies the PublicLinkService creates links correctly
     * and demonstrates what the service provides that raw Prisma does not:
     * - Cryptographically secure 64-character hex token
     * - Expiration date validation
     * - Workspace membership verification
     */
    it('should create PublicLink fixtures via PublicLinkService with proper business logic', async () => {
      // GOOD: Use service (sets RLS, validates, generates secure token)
      const link = await publicLinkService.create(
        testWorkspaceId,
        testUserId,
        {
          name: 'Test Link via Service',
          allowedTags: ['support'],
        },
      );

      // Verify link was created
      expect(link).toBeDefined();
      expect(link.id).toBeDefined();
      expect(link.workspaceId).toBe(testWorkspaceId);
      expect(link.name).toBe('Test Link via Service');

      // Verify service-generated token format (64 hex chars from randomBytes(32))
      // This is business logic that raw Prisma bypasses
      expect(link.token).toBeDefined();
      expect(link.token).toMatch(/^[a-f0-9]{64}$/);
      expect(link.token.length).toBe(64);

      // Verify default values set by service
      expect(link.isActive).toBe(true);
      expect(link.allowedTags).toEqual(['support']);
    });

    it('should validate expiration date (business logic that Prisma bypasses)', async () => {
      // BAD: Raw Prisma would accept past expiration date
      // GOOD: Service validates and throws BadRequestException
      const pastDate = new Date(Date.now() - 1000);

      await expect(
        publicLinkService.create(testWorkspaceId, testUserId, {
          name: 'Invalid Link',
          expiresAt: pastDate,
        }),
      ).rejects.toThrow('Expiration date must be in the future');
    });
  });

  describe('Fixture pattern comparison (documentation)', () => {
    /**
     * This test documents the difference between:
     * - BAD: Direct Prisma (bypasses business logic)
     * - GOOD: PublicLinkService (enforces all business rules)
     *
     * Run this test to see the pattern in action.
     */
    it('should demonstrate why service-based fixtures are required', async () => {
      // Pattern 1: BAD - Direct Prisma (DO NOT USE in fixtures)
      // This bypasses:
      // - Token generation (must manually create secure token)
      // - Expiration validation
      // - Workspace membership check
      //
      // Example of what NOT to do:
      // const badLink = await prisma.publicLink.create({
      //   data: {
      //     workspaceId: testWorkspaceId,
      //     token: 'manually-created-token', // Not cryptographically secure!
      //     name: 'Bad Link',
      //   }
      // });

      // Pattern 2: GOOD - PublicLinkService (USE THIS in fixtures)
      // This ensures:
      // - Cryptographically secure token (randomBytes(32).toString('hex'))
      // - Expiration date validation
      // - Workspace membership verification
      // - All business rules enforced
      const goodLink = await publicLinkService.create(
        testWorkspaceId,
        testUserId,
        {
          name: 'Good Link',
          allowedTags: ['test'],
        },
      );

      // Service-created link has proper token format
      expect(goodLink.token).toMatch(/^[a-f0-9]{64}$/);

      // Verify link exists in database
      const dbLink = await prisma.publicLink.findUnique({
        where: { id: goodLink.id },
      });
      expect(dbLink).toBeDefined();
      expect(dbLink?.token).toBe(goodLink.token);
    });
  });
});
