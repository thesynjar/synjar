import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';

/**
 * Registration → Workspace Visibility E2E Integration Test
 *
 * REGRESSION TEST: "Workspace created during registration is NOT visible in dashboard"
 *
 * Problem:
 * - User registers with workspace name "Michał Kukla"
 * - POST /auth/register → 201 success, returns userId, tokens
 * - Workspace and WorkspaceMember are created in database (verified)
 * - GET /workspaces → returns [] (empty array)
 * - Dashboard shows "No workspaces yet" instead of workspace card
 *
 * Root Cause (Hypothesis):
 * - createWithWorkspace() uses Prisma.$transaction() WITHOUT setting RLS context
 * - RLS policy `workspace_select` requires either:
 *   - id IN (SELECT * FROM get_user_workspace_ids()) (member-based)
 *   - OR "createdById" = get_current_user_id() (creator-based)
 * - During registration, NO app.current_user_id is set
 * - get_current_user_id() returns NULL/empty → workspace is filtered out
 * - get_user_workspace_ids() returns empty set → workspace is filtered out
 *
 * User Flow:
 * 1. User navigates to /register
 * 2. Fills form: email, password, workspaceName
 * 3. POST /auth/register → 201 success
 * 4. **EXPECTED**: Workspace is visible via GET /workspaces
 * 5. **ACTUAL BUG**: GET /workspaces returns [] (workspace is filtered by RLS)
 * 6. Dashboard shows "No workspaces yet" EmptyState
 *
 * Test Strategy:
 * - Test behavior: "Workspace created during registration should be visible immediately"
 * - AAA pattern: Arrange (setup), Act (register + fetch), Assert (workspace visible)
 * - Use real PrismaService with test database (RLS enabled)
 * - Clean database before each test (avoid test pollution)
 * - NO mocks for domain/repositories (test real RLS behavior)
 * - Use JWT token from registration to fetch workspaces (same user context)
 *
 * Prerequisites:
 *   pnpm test:e2e -- --testPathPattern=registration-workspace-visibility
 *
 * Environment (from test/.env.test):
 *   - NODE_ENV=test
 *   - DEPLOYMENT_MODE=cloud
 *   - DATABASE_URL=postgresql://postgres:postgres@localhost:6311/synjar_test
 *   - SMTP_HOST=localhost
 *   - SMTP_PORT=6312
 *   - MAILPIT_API_URL=http://localhost:6313
 *   - JWT_SECRET=test-jwt-secret-for-e2e-tests
 *   - EMAIL_VERIFICATION_URL=http://localhost:6210/auth/verify
 *
 * Test MUST FAIL initially:
 *   This is a regression test for existing bug. Test will:
 *   1. Register new user with workspace name
 *   2. Verify registration response (userId, tokens)
 *   3. Call GET /workspaces with same user's JWT token
 *   4. Assert: workspace array is NOT empty (this will FAIL initially, confirming bug)
 *   5. After fix, test will PASS
 *
 * Related files:
 *   - Problem analysis: docs/agents/problem-analyzer/reports/2025-12-26-22-21-workspace-missing-after-registration.md
 *   - User repository: community/apps/api/src/infrastructure/persistence/repositories/user.repository.impl.ts
 *   - Workspace service: community/apps/api/src/application/workspace/workspace.service.ts
 *   - RLS migration: community/apps/api/prisma/migrations/20251225140000_fix_workspace_rls/migration.sql
 */

describe('Registration → Workspace Visibility (REGRESSION)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Environment variables are set by setup-env.ts
    // Test ports: SMTP 6312, Mailpit API 6313, Postgres 6311

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

    // Get Prisma service for cleanup and verification
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // No cleanup needed - tests use unique emails per run (timestamp-based)
    // This follows the pattern from registration-e2e.integration.spec.ts
    await app.close();
  });

  beforeEach(async () => {
    // Set Cloud mode for registration tests
    process.env.DEPLOYMENT_MODE = 'cloud';
    // No cleanup needed - tests use unique emails per run (timestamp-based)
  });

  /**
   * REGRESSION: Workspace created during registration should be visible immediately
   *
   * This test verifies that:
   * 1. User registers with workspace name
   * 2. Registration creates User + Workspace + WorkspaceMember in one transaction
   * 3. User immediately calls GET /workspaces (with auto-login token)
   * 4. Workspace is visible (RLS properly configured)
   */
  it('REGRESSION: Workspace should be visible immediately after registration (auto-login)', async () => {
    // ARRANGE: Setup test data
    const email = `autologin-${Date.now()}@workspace-visibility-test.com`;
    const workspaceName = 'Michał Kukla'; // Original bug report workspace name
    const password = process.env.TEST_USER_PASSWORD || 'SecurePass123!';

    // ACT 1: Register user (creates User + Workspace + WorkspaceMember)
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        workspaceName,
        name: 'Michał',
      })
      .expect(201);

    const { accessToken, userId } = registerRes.body;

    // ASSERT 1: Registration succeeded with auto-login tokens
    expect(accessToken).toBeDefined();
    expect(userId).toBeDefined();
    expect(registerRes.body.message).toBe('Registration successful. Please check your email.');

    // ACT 2: Fetch workspaces (using JWT from registration - auto-login)
    const workspacesRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const workspaces = workspacesRes.body;

    // ASSERT 2: Workspace should be visible via API
    expect(workspaces).toBeInstanceOf(Array);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe(workspaceName);
    expect(workspaces[0].createdById).toBe(userId);

    // ASSERT 3: User is OWNER of workspace
    expect(workspaces[0].members).toBeDefined();
    expect(workspaces[0].members).toHaveLength(1);
    expect(workspaces[0].members[0].userId).toBe(userId);
    expect(workspaces[0].members[0].role).toBe('OWNER');
  });

  /**
   * REGRESSION: Workspace should also be visible after email verification + login
   *
   * This test verifies the full flow (including email verification):
   * 1. User registers
   * 2. User verifies email (optional, skipped in test via direct DB update)
   * 3. User logs in
   * 4. User fetches workspaces
   * 5. **BUG**: Workspace is filtered out by RLS
   * 6. **FIX**: After setting RLS context during registration, workspace is visible
   */
  it('REGRESSION: Workspace should be visible after login (full verification flow)', async () => {
    // ARRANGE: Setup test data
    const email = `verified-${Date.now()}@workspace-visibility-test.com`;
    const workspaceName = 'Verified User Workspace';
    const password = process.env.TEST_USER_PASSWORD || 'SecurePass123!';

    // ACT 1: Register user
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        workspaceName,
        name: 'Verified User',
      })
      .expect(201);

    const { userId } = registerRes.body;
    expect(userId).toBeDefined();

    // ACT 2: Simulate email verification (direct DB update to skip Mailpit)
    await prisma.user.update({
      where: { email },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
      },
    });

    // ACT 3: Login (get fresh JWT token)
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password,
      })
      .expect(201);

    const { accessToken } = loginRes.body;
    expect(accessToken).toBeDefined();

    // ACT 4: Fetch workspaces (after full flow)
    const workspacesRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const workspaces = workspacesRes.body;

    // ASSERT: Workspace still visible (TEST WILL FAIL IF BUG EXISTS)
    expect(workspaces).toBeInstanceOf(Array);
    expect(workspaces).toHaveLength(1); // ❌ FAILS initially (returns [])
    expect(workspaces[0].name).toBe(workspaceName); // ❌ FAILS (undefined)

    // VERIFY: User is OWNER
    expect(workspaces[0].members).toBeDefined();
    const ownerMember = workspaces[0].members.find(
      (m: { role: string }) => m.role === 'OWNER',
    );
    expect(ownerMember).toBeDefined();
    expect(ownerMember.userId).toBe(userId);
  });

  /**
   * Self-Hosted mode test is skipped because:
   * - The NestJS app is already initialized with DEPLOYMENT_MODE from environment
   * - Changing process.env mid-test doesn't affect already-loaded config
   * - A proper test would require a separate test setup for self-hosted mode
   */
  it.skip('REGRESSION: Workspace should be visible in self-hosted mode (first user)', async () => {
    // This test requires separate setup with DEPLOYMENT_MODE=self-hosted from the start
  });

  /**
   * Verify workspace is visible after registration (additional test).
   *
   * This test confirms that:
   * 1. Registration creates user + workspace
   * 2. Workspace is immediately visible via API
   */
  it('Workspace should be visible via API after registration', async () => {
    // ARRANGE
    const email = `verify-${Date.now()}@workspace-visibility-test.com`;
    const workspaceName = 'Verify Workspace';

    // ACT 1: Register user
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'SecurePass123!',
        workspaceName,
      })
      .expect(201);

    const { userId, accessToken } = registerRes.body;
    expect(userId).toBeDefined();
    expect(accessToken).toBeDefined();

    // ACT 2: Fetch workspaces via API
    const workspacesRes = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const workspaces = workspacesRes.body;

    // ASSERT: Workspace is visible via API
    expect(workspaces).toBeInstanceOf(Array);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe(workspaceName);
    expect(workspaces[0].createdById).toBe(userId);
    expect(workspaces[0].members).toHaveLength(1);
    expect(workspaces[0].members[0].userId).toBe(userId);
    expect(workspaces[0].members[0].role).toBe('OWNER');
  });
});
