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
 * - POST /api/v1/auth/register → 201 success, returns userId, tokens
 * - Workspace and WorkspaceMember are created in database (verified)
 * - GET /api/v1/workspaces → returns [] (empty array)
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
 * 3. POST /api/v1/auth/register → 201 success
 * 4. **EXPECTED**: Workspace is visible via GET /api/v1/workspaces
 * 5. **ACTUAL BUG**: GET /api/v1/workspaces returns [] (workspace is filtered by RLS)
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
 *   - DATABASE_URL=postgresql://postgres:postgres@localhost:6211/synjar_test
 *   - SMTP_HOST=localhost
 *   - SMTP_PORT=6212
 *   - MAILPIT_API_URL=http://localhost:6213
 *   - JWT_SECRET=test-jwt-secret-for-e2e-tests
 *   - EMAIL_VERIFICATION_URL=http://localhost:6210/auth/verify
 *
 * Test MUST FAIL initially:
 *   This is a regression test for existing bug. Test will:
 *   1. Register new user with workspace name
 *   2. Verify registration response (userId, tokens)
 *   3. Call GET /api/v1/workspaces with same user's JWT token
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
    // Test ports: SMTP 6212, Mailpit API 6213, Postgres 6211

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [await AppModule.forRoot()],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same middleware as production
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
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
   * This test reproduces the bug:
   * 1. User registers with workspace name
   * 2. Registration creates User + Workspace + WorkspaceMember in one transaction
   * 3. User immediately calls GET /api/v1/workspaces (with auto-login token)
   * 4. **BUG**: Workspace is filtered out by RLS (empty array returned)
   * 5. **FIX**: After setting RLS context during registration, workspace is visible
   *
   * Test will FAIL initially (confirming bug), then PASS after fix.
   */
  it('REGRESSION: Workspace should be visible immediately after registration (auto-login)', async () => {
    // ARRANGE: Setup test data
    const email = `autologin-${Date.now()}@workspace-visibility-test.com`;
    const workspaceName = 'Michał Kukla'; // Original bug report workspace name
    const password = process.env.TEST_USER_PASSWORD || 'SecurePass123!';

    // ACT 1: Register user (creates User + Workspace + WorkspaceMember)
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
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

    // VERIFY: Workspace was created in database
    const workspaceInDb = await prisma.workspace.findFirst({
      where: {
        name: workspaceName,
        createdById: userId,
      },
      include: {
        members: {
          where: { userId },
        },
      },
    });
    expect(workspaceInDb).toBeDefined();
    expect(workspaceInDb?.members).toHaveLength(1);
    expect(workspaceInDb?.members[0].role).toBe('OWNER');

    // ACT 2: Fetch workspaces (using JWT from registration - auto-login)
    const workspacesRes = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const workspaces = workspacesRes.body;

    // ASSERT 2: Workspace should be visible (TEST WILL FAIL IF BUG EXISTS)
    expect(workspaces).toBeInstanceOf(Array);
    expect(workspaces).toHaveLength(1); // ❌ FAILS initially (returns [])
    expect(workspaces[0].name).toBe(workspaceName); // ❌ FAILS (undefined)
    expect(workspaces[0].id).toBe(workspaceInDb?.id); // Verify same workspace

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
      .post('/api/v1/auth/register')
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
      .post('/api/v1/auth/login')
      .send({
        email,
        password,
      })
      .expect(201);

    const { accessToken } = loginRes.body;
    expect(accessToken).toBeDefined();

    // ACT 4: Fetch workspaces (after full flow)
    const workspacesRes = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
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
   * REGRESSION: Should work in Self-Hosted mode (first user registration)
   *
   * This test verifies that RLS fix also works in self-hosted mode:
   * 1. First user registers (instant verification, no email required)
   * 2. User is auto-logged in
   * 3. Workspace should be visible immediately
   */
  it('REGRESSION: Workspace should be visible in self-hosted mode (first user)', async () => {
    // ARRANGE: Set self-hosted mode
    process.env.DEPLOYMENT_MODE = 'self-hosted';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';

    const email = `admin-${Date.now()}@workspace-visibility-test.com`;
    const workspaceName = 'Admin Workspace';
    const password = process.env.TEST_USER_PASSWORD || 'SecurePass123!';

    // ACT 1: Register first user (self-hosted mode)
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        workspaceName,
        name: 'Admin User',
      })
      .expect(201);

    const { accessToken, userId } = registerRes.body;
    expect(accessToken).toBeDefined();
    expect(userId).toBeDefined();

    // VERIFY: User is verified immediately (self-hosted mode)
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.isEmailVerified).toBe(true);

    // ACT 2: Fetch workspaces
    const workspacesRes = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const workspaces = workspacesRes.body;

    // ASSERT: Workspace visible (TEST WILL FAIL IF BUG EXISTS)
    expect(workspaces).toBeInstanceOf(Array);
    expect(workspaces).toHaveLength(1); // ❌ FAILS initially (returns [])
    expect(workspaces[0].name).toBe(workspaceName); // ❌ FAILS (undefined)
    expect(workspaces[0].members[0].role).toBe('OWNER');
  });

  /**
   * Database-level verification: WorkspaceMember exists but is filtered by RLS
   *
   * This test verifies the root cause by:
   * 1. Registering user + workspace
   * 2. Querying database directly (bypassing RLS)
   * 3. Verifying WorkspaceMember exists
   * 4. Calling API (with RLS)
   * 5. Verifying workspace is filtered out (empty array)
   */
  it('DEBUG: WorkspaceMember exists in DB but is filtered by RLS', async () => {
    // ARRANGE
    const email = `debug-rls-${Date.now()}@workspace-visibility-test.com`;
    const workspaceName = 'RLS Debug Workspace';

    // ACT 1: Register user
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'SecurePass123!',
        workspaceName,
      })
      .expect(201);

    const { userId, accessToken } = registerRes.body;

    // VERIFY 1: Workspace exists in database (direct query, bypasses RLS)
    const workspaceInDb = await prisma.workspace.findFirst({
      where: { createdById: userId },
      include: { members: true },
    });
    expect(workspaceInDb).toBeDefined();
    expect(workspaceInDb?.name).toBe(workspaceName);

    // VERIFY 2: WorkspaceMember exists (direct query)
    const memberInDb = await prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId: workspaceInDb!.id,
      },
    });
    expect(memberInDb).toBeDefined();
    expect(memberInDb?.role).toBe('OWNER');

    // ACT 2: Fetch workspaces via API (with RLS filtering)
    const workspacesRes = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // ASSERT: API returns empty array (RLS filters workspace out)
    // This confirms the bug: data exists but RLS policy filters it out
    const workspaces = workspacesRes.body;
    expect(workspaces).toHaveLength(1); // ❌ FAILS initially (bug confirmed)

    // Additional debugging: Log RLS context (use console.warn for CI compatibility)
     
    console.warn('DEBUG: User ID:', userId, 'Workspace ID:', workspaceInDb?.id, 'WorkspaceMember ID:', memberInDb?.id, 'API workspaces response:', workspaces);
  });
});
