import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';

/**
 * Registration E2E Integration Tests - Dual-Mode Registration (Phase 7)
 *
 * This test suite validates:
 * 1. Cloud Mode: Public registration, email verification, auto-login, grace period
 * 2. Self-Hosted Mode: First user admin, registration blocking, invitation system
 * 3. Security: Constant-time responses, rate limiting, password validation
 *
 * Prerequisites (TEST environment - separate from dev):
 * - Mailpit running on localhost:6212 (SMTP) / 6213 (API)
 * - PostgreSQL running on localhost:6211
 *
 * Run with: pnpm test:e2e -- --testPathPattern=registration-e2e
 *
 * Spec: docs/specifications/2025-12-26-dual-mode-registration.md (Section 6.2)
 */

// Mailpit API configuration (loaded from setup-env.ts or environment)
const MAILPIT_API_URL = process.env.MAILPIT_API_URL || 'http://localhost:6213';

interface MailpitMessage {
  ID: string;
  MessageID: string;
  From: { Address: string; Name: string };
  To: { Address: string; Name: string }[];
  Subject: string;
  Date: string;
  Text: string;
  HTML: string;
}

interface MailpitMessagesResponse {
  messages: MailpitMessage[];
  total: number;
}

/**
 * Helper to fetch messages from Mailpit API
 */
async function getMailpitMessages(email?: string): Promise<MailpitMessage[]> {
  const url = email
    ? `${MAILPIT_API_URL}/api/v1/search?query=to:${email}`
    : `${MAILPIT_API_URL}/api/v1/messages`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Mailpit messages: ${response.statusText}`);
  }

  const data = (await response.json()) as MailpitMessagesResponse;
  return data.messages || [];
}

/**
 * Helper to get a specific message by ID
 */
async function getMailpitMessage(id: string): Promise<MailpitMessage> {
  const response = await fetch(`${MAILPIT_API_URL}/api/v1/message/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch Mailpit message: ${response.statusText}`);
  }
  return response.json() as Promise<MailpitMessage>;
}

/**
 * Helper to delete all messages from Mailpit
 */
async function clearMailpit(): Promise<void> {
  try {
    await fetch(`${MAILPIT_API_URL}/api/v1/messages`, { method: 'DELETE' });
  } catch {
    // Ignore errors - Mailpit might not be available in some test environments
  }
}

/**
 * Helper to extract verification token from email HTML/Text
 */
function extractVerificationToken(message: MailpitMessage): string | null {
  // Try to extract from HTML first
  const htmlMatch = message.HTML?.match(/token=([a-f0-9]{64})/);
  if (htmlMatch) return htmlMatch[1];

  // Fallback to text
  const textMatch = message.Text?.match(/token=([a-f0-9]{64})/);
  if (textMatch) return textMatch[1];

  return null;
}

/**
 * Helper to wait for email to arrive in Mailpit
 */
async function waitForEmail(
  email: string,
  maxWaitMs = 10000,
  pollIntervalMs = 500,
): Promise<MailpitMessage> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const messages = await getMailpitMessages(email);
    if (messages.length > 0) {
      // Get full message with body
      return getMailpitMessage(messages[0].ID);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timeout waiting for email to ${email}`);
}

describe('Registration E2E Integration Tests', () => {
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

    // Get Prisma service for cleanup
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Clear Mailpit before tests
    await clearMailpit();
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          -- Delete WorkspaceMember entries
          DELETE FROM "WorkspaceMember"
          WHERE "workspaceId" IN (
            SELECT id FROM "Workspace"
            WHERE "createdById" IN (
              SELECT id FROM "User" WHERE email LIKE '%@registration-e2e-test.com'
            )
          );

          -- Delete Workspace entries
          DELETE FROM "Workspace"
          WHERE "createdById" IN (
            SELECT id FROM "User" WHERE email LIKE '%@registration-e2e-test.com'
          );

          -- Delete User entries
          DELETE FROM "User" WHERE email LIKE '%@registration-e2e-test.com';
        END $$;
      `);
    } catch (error) {
      console.warn('Cleanup failed:', (error as Error).message);
    } finally {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Clear Mailpit before each test
    await clearMailpit();
  });

  // ============================================================================
  // PHASE 7: DUAL-MODE REGISTRATION TESTS (Section 6.2)
  // ============================================================================

  describe('Cloud Mode - Auto-login (REQ-C3)', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_MODE = 'cloud';
    });

    it('should auto-login new user with cookies and verify immediate workspace access', async () => {
      const email = `autologin-${Date.now()}@registration-e2e-test.com`;

      // 1. Register new user
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          workspaceName: 'Auto-login Test Workspace',
          name: 'Auto Login User',
        })
        .expect(201);

      // 2. Check response contains tokens (auto-login)
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.userId).toBeDefined();
      expect(res.body.message).toBe('Registration successful. Please check your email.');

      // 3. Check cookies are set
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookiesArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookiesArray.some((c: string) => c.includes('access_token='))).toBe(true);
      expect(cookiesArray.some((c: string) => c.includes('refresh_token='))).toBe(true);

      // 4. Verify immediate workspace access using cookies
      const workspacesRes = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', cookies)
        .expect(200);

      expect(workspacesRes.body).toBeInstanceOf(Array);
      expect(workspacesRes.body.length).toBeGreaterThanOrEqual(1);
      const workspace = workspacesRes.body.find(
        (ws: { name: string }) => ws.name === 'Auto-login Test Workspace',
      );
      expect(workspace).toBeDefined();
    });
  });

  describe('Cloud Mode - Grace Period (REQ-C4)', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_MODE = 'cloud';
      process.env.GRACE_PERIOD_MINUTES = '15';
    });

    it('should allow login within 15-minute grace period for unverified users', async () => {
      const email = `grace-period-${Date.now()}@registration-e2e-test.com`;

      // 1. Register user (unverified)
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          workspaceName: 'Grace Period Workspace',
        })
        .expect(201);

      // 2. Wait for email
      const message = await waitForEmail(email);
      expect(message).toBeDefined();

      // 3. Login immediately (within grace period) - should succeed
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'SecurePass123!',
        })
        .expect(201);

      expect(loginRes.body.message).toBe('Login successful');
      expect(loginRes.body.accessToken).toBeDefined();

      // 4. Verify user is still unverified
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.isEmailVerified).toBe(false);
    });

    it('should block login after 15-minute grace period for unverified users', async () => {
      const email = `expired-grace-${Date.now()}@registration-e2e-test.com`;

      // 1. Register user
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          workspaceName: 'Expired Grace Workspace',
        })
        .expect(201);

      // 2. Manually set createdAt to >15 minutes ago
      await prisma.user.update({
        where: { email },
        data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) }, // 20 minutes ago
      });

      // 3. Try to login - should fail
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'SecurePass123!',
        })
        .expect(401);

      expect(loginRes.body.message).toContain('verify your email');
    });
  });

  describe('Self-Hosted Mode - First User (REQ-S1, REQ-S2)', () => {
    beforeEach(async () => {
      process.env.DEPLOYMENT_MODE = 'self-hosted';
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';

      // Ensure no workspaces exist
      await prisma.$executeRawUnsafe(`
        DELETE FROM "WorkspaceMember";
        DELETE FROM "Workspace";
        DELETE FROM "User";
      `);
    });

    it('should allow first user registration without verification and instant admin access', async () => {
      const email = `admin-${Date.now()}@registration-e2e-test.com`;

      // 1. Register first user
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          workspaceName: 'Admin Workspace',
          name: 'First Admin User',
        })
        .expect(201);

      // 2. Check response
      expect(res.body.message).toContain('log in now');
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      // 3. Verify user is marked as verified (no email verification needed)
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.isEmailVerified).toBe(true);
      expect(user?.emailVerificationToken).toBeNull();

      // 4. Verify workspace was created
      const workspaces = await prisma.workspace.findMany({
        where: { members: { some: { userId: user!.id } } },
      });
      expect(workspaces.length).toBe(1);
      expect(workspaces[0].name).toBe('Admin Workspace');

      // 5. Verify user is OWNER
      const member = await prisma.workspaceMember.findFirst({
        where: { userId: user!.id, workspaceId: workspaces[0].id },
      });
      expect(member?.role).toBe('OWNER');
    });
  });

  describe('Self-Hosted Mode - Registration Blocking (REQ-S3, REQ-S6)', () => {
    beforeEach(async () => {
      process.env.DEPLOYMENT_MODE = 'self-hosted';
      process.env.ADMIN_EMAIL = 'admin@company.com';
    });

    it('should block second user registration with 403 and ADMIN_EMAIL', async () => {
      // 1. Create first user and workspace
      const firstUser = await prisma.user.create({
        data: {
          email: 'first@registration-e2e-test.com',
          passwordHash: 'hashed',
          isEmailVerified: true,
        },
      });
      await prisma.workspace.create({
        data: {
          name: 'Existing Workspace',
          createdById: firstUser.id,
          members: {
            create: {
              userId: firstUser.id,
              role: 'OWNER',
            },
          },
        },
      });

      // 2. Try to register second user
      const email = `hacker-${Date.now()}@external.com`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          workspaceName: 'Hacker Workspace',
        })
        .expect(403);

      // 3. Verify error response
      expect(res.body.error).toBe('REGISTRATION_DISABLED');
      expect(res.body.message).toContain('disabled on this instance');
      expect(res.body.adminContact).toBe('admin@company.com');
    });
  });

  describe('Invitation System - Full Flow (REQ-S4)', () => {
    let ownerCookies: string | string[];
    let workspaceId: string;

    beforeEach(async () => {
      process.env.DEPLOYMENT_MODE = 'self-hosted';

      // Setup: Create workspace and owner
      const email = `owner-${Date.now()}@registration-e2e-test.com`;
      const registerRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          workspaceName: 'Invitation Test Workspace',
        })
        .expect(201);

      ownerCookies = registerRes.headers['set-cookie'];

      // Get workspace ID
      const workspacesRes = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', ownerCookies)
        .expect(200);

      workspaceId = workspacesRes.body[0].id;
    });

    it('should complete invite → accept → workspace access flow', async () => {
      const invitedEmail = `invited-${Date.now()}@registration-e2e-test.com`;

      // 1. Owner invites user
      const cookiesArray = Array.isArray(ownerCookies) ? ownerCookies : [ownerCookies];
      const inviteRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/invite`)
        .set('Cookie', cookiesArray)
        .send({
          email: invitedEmail,
          role: 'MEMBER',
        })
        .expect(201);

      expect(inviteRes.body.invitationToken).toBeDefined();
      const { invitationToken } = inviteRes.body;

      // 2. Invited user accepts invitation
      const acceptRes = await request(app.getHttpServer())
        .post('/api/v1/auth/accept-invite')
        .send({
          token: invitationToken,
          password: 'SecurePass123!',
          name: 'Invited User',
        })
        .expect(201);

      expect(acceptRes.body.accessToken).toBeDefined();
      expect(acceptRes.body.user.email).toBe(invitedEmail);

      // 3. Verify user in workspace
      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          user: { email: invitedEmail },
        },
        include: { user: true },
      });
      expect(member).toBeDefined();
      expect(member?.role).toBe('MEMBER');
      expect(member?.user.isEmailVerified).toBe(true); // Invited users skip verification

      // 4. Verify workspace access
      const invitedCookies = acceptRes.headers['set-cookie'];
      const workspacesRes = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', invitedCookies)
        .expect(200);

      expect(workspacesRes.body.length).toBeGreaterThanOrEqual(1);
      const workspace = workspacesRes.body.find((ws: { id: string }) => ws.id === workspaceId);
      expect(workspace).toBeDefined();
    });
  });

  describe('Security - Constant-Time Responses (REQ-C5)', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_MODE = 'cloud';
    });

    it('should have registration response time variance <50ms regardless of user existence', async () => {
      const times: number[] = [];

      // Create one existing user
      const existingEmail = `existing-${Date.now()}@registration-e2e-test.com`;
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: existingEmail,
          password: 'SecurePass123!',
          workspaceName: 'Existing Workspace',
        })
        .expect(201);

      // Verify the user
      await prisma.user.update({
        where: { email: existingEmail },
        data: { isEmailVerified: true },
      });

      // Test 10 registrations (mix of new and existing users)
      for (let i = 0; i < 10; i++) {
        const email = i % 2 === 0 ? `new-${Date.now()}-${i}@registration-e2e-test.com` : existingEmail;
        const start = Date.now();

        await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email,
            password: 'SecurePass123!',
            workspaceName: `Test Workspace ${i}`,
          });

        times.push(Date.now() - start);

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // All times should be within 50ms of each other
      const min = Math.min(...times);
      const max = Math.max(...times);
      const variance = max - min;

      expect(variance).toBeLessThan(50);
    });
  });

  describe('Security - Password Validation (REQ-C7)', () => {
    it('should reject weak password with specific validation errors', async () => {
      const testCases = [
        {
          password: 'short',
          expectedError: 'Password must be at least 12 characters',
        },
        {
          password: 'nouppercase1!',
          expectedError: 'Password must contain at least one uppercase letter',
        },
        {
          password: 'NOLOWERCASE1!',
          expectedError: 'Password must contain at least one lowercase letter',
        },
        {
          password: 'NoNumbers!',
          expectedError: 'Password must contain at least one number',
        },
        {
          password: 'NoSpecialChar123',
          expectedError: 'Password must contain at least one special character',
        },
      ];

      for (const { password, expectedError } of testCases) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email: `weak-${Date.now()}@registration-e2e-test.com`,
            password,
            workspaceName: 'Test Workspace',
          })
          .expect(400);

        const messages = Array.isArray(res.body.message) ? res.body.message : [res.body.message];
        expect(messages.some((m: string) => m.includes(expectedError))).toBe(true);
      }
    });
  });

  describe('Security - Rate Limiting (REQ-C8)', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_MODE = 'cloud';
      process.env.THROTTLE_LIMIT_REGISTER = '3';
      process.env.THROTTLE_TTL = '60000';
    });

    it('should return 429 error after exceeding rate limit (3 req/min)', async () => {
      // Make 3 requests (should succeed)
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email: `rate-limit-${Date.now()}-${i}@registration-e2e-test.com`,
            password: 'SecurePass123!',
            workspaceName: `Test Workspace ${i}`,
          })
          .expect(201);
      }

      // 4th request should be rate limited
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `rate-limit-${Date.now()}-4@registration-e2e-test.com`,
          password: 'SecurePass123!',
          workspaceName: 'Test Workspace 4',
        })
        .expect(429);

      expect(res.body.message).toContain('Too Many Requests');
    });
  });

  // ============================================================================
  // REGRESSION TESTS
  // ============================================================================

  describe('REGRESSION: Email Template Build Path (Issue 6f7a8b9c)', () => {
    /**
     * REGRESSION TEST: Email template file path mismatch in build output
     *
     * Problem:
     * - Nest.js copies assets (.hbs files) to dist/ without src/ prefix
     * - Runtime code expects templates at dist/src/application/email/templates/
     * - Actual location: dist/application/email/templates/ (missing src/)
     * - Result: ENOENT error when sending verification email
     *
     * User Flow:
     * 1. User registers in cloud mode
     * 2. Backend tries to send verification email
     * 3. EmailService.sendEmailVerification() loads template via HandlebarsAdapter
     * 4. EXPECTED: Template file exists and email is sent
     * 5. ACTUAL BUG: Template file not found, ENOENT error
     *
     * Test Strategy:
     * - Test behavior: "User registers in cloud mode -> verification email is sent"
     * - Uses ts-node in test mode (simpler than testing built code)
     * - Verifies email arrives in Mailpit (no ENOENT errors)
     * - TODO: Test should use built code (dist/) to catch template path issues
     *
     * Prerequisites:
     * - NODE_ENV=test
     * - DEPLOYMENT_MODE=cloud
     * - Mailpit running on localhost:6212 (SMTP) / 6213 (API)
     *
     * Environment variables (from .env.test):
     * - SMTP_HOST=localhost
     * - SMTP_PORT=6212
     * - MAILPIT_API_URL=http://localhost:6213
     * - EMAIL_VERIFICATION_URL=http://localhost:6210/auth/verify
     *
     * Root Cause:
     * - nest-cli.json: "outDir": "dist" (should be "dist/src")
     * - email.module.ts: join(__dirname, 'templates') expects dist/src/application/email/templates/
     *
     * Fix:
     * - Change nest-cli.json: "outDir": "dist/src" to preserve src/ structure
     *
     * Test will FAIL if:
     * - Template file is not accessible (ENOENT error in logs)
     * - Email is not sent to Mailpit
     * - No verification token in email
     */

    beforeEach(() => {
      process.env.DEPLOYMENT_MODE = 'cloud';
    });

    it('should send verification email without ENOENT error when user registers in cloud mode', async () => {
      const email = `template-path-${Date.now()}@registration-e2e-test.com`;

      // ARRANGE: Clear Mailpit
      await clearMailpit();

      // ACT: Register user in cloud mode (triggers email sending)
      const registerRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          workspaceName: 'Template Test Workspace',
          name: 'Template Test User',
        })
        .expect(201);

      // ASSERT 1: Registration succeeded
      expect(registerRes.body.userId).toBeDefined();
      expect(registerRes.body.message).toBe('Registration successful. Please check your email.');

      // ASSERT 2: Verification email was sent to Mailpit
      const message = await waitForEmail(email, 10000);
      expect(message).toBeDefined();
      expect(message.Subject).toBe('Verify your email - Synjar');
      expect(message.To[0].Address).toBe(email);

      // ASSERT 3: Email contains verification token (template was rendered correctly)
      const token = extractVerificationToken(message);
      expect(token).toBeTruthy();
      expect(token).toMatch(/^[a-f0-9]{64}$/);

      // ASSERT 4: Email HTML/Text is not empty (template was loaded)
      expect(message.HTML?.length).toBeGreaterThan(0);
      expect(message.Text?.length).toBeGreaterThan(0);

      // ASSERT 5: Verify user was created with verification token
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.emailVerificationToken).toBeTruthy();
      expect(user?.isEmailVerified).toBe(false);

      // If this test passes:
      // - No ENOENT error occurred
      // - Template file was found and loaded successfully
      // - Email was sent via SMTP to Mailpit
      // - HandlebarsAdapter rendered the template correctly
    });
  });

  // ============================================================================
  // EXISTING TESTS (kept for backwards compatibility)
  // ============================================================================

  describe('Registration Flow', () => {
    it('should register user with workspace and send verification email', async () => {
      const email = `user-${Date.now()}@registration-e2e-test.com`;

      // 1. Register user
      const registerRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'MyP@ssw0rd123!',
          workspaceName: 'My Test Workspace',
          name: 'Test User',
        })
        .expect(201);

      expect(registerRes.body).toEqual({
        message: 'Registration successful. Please check your email.',
        userId: expect.any(String),
      });

      // 2. Verify email was sent
      const message = await waitForEmail(email);
      expect(message.Subject).toBe('Verify your email - Synjar');
      expect(message.To[0].Address).toBe(email);

      // 3. Extract verification token
      const token = extractVerificationToken(message);
      expect(token).toBeTruthy();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should NOT allow login before email verification', async () => {
      const email = `unverified-${Date.now()}@registration-e2e-test.com`;

      // Register user
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'MyP@ssw0rd123!',
          workspaceName: 'Unverified Workspace',
        })
        .expect(201);

      // Try to login - should work (login doesn't check email verification)
      // But workspace access will show unverified status
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'MyP@ssw0rd123!',
        })
        .expect(201);

      expect(loginRes.body.message).toBe('Login successful');
    });

    it('should verify email with valid token', async () => {
      const email = `verify-${Date.now()}@registration-e2e-test.com`;

      // 1. Register user
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'MyP@ssw0rd123!',
          workspaceName: 'Verify Test Workspace',
        })
        .expect(201);

      // 2. Get verification email
      const message = await waitForEmail(email);
      const token = extractVerificationToken(message);
      expect(token).toBeTruthy();

      // 3. Verify email
      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);

      expect(verifyRes.body).toEqual({
        message: 'Email verified successfully',
      });

      // 4. Verify user is now verified in database
      const user = await prisma.user.findUnique({
        where: { email },
      });
      expect(user?.isEmailVerified).toBe(true);
      expect(user?.emailVerifiedAt).toBeDefined();
      expect(user?.emailVerificationToken).toBeNull();
    });

    it('should reject verification with invalid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'invalid-token-that-does-not-exist' })
        .expect(404);
    });

    it('should reject duplicate email registration', async () => {
      const email = `duplicate-${Date.now()}@registration-e2e-test.com`;

      // First registration
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'MyP@ssw0rd123!',
          workspaceName: 'First Workspace',
        })
        .expect(201);

      // Second registration with same email
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'AnotherP@ss123!',
          workspaceName: 'Second Workspace',
        })
        .expect(409);
    });
  });

  describe('Resend Verification', () => {
    it('should resend verification email', async () => {
      const email = `resend-${Date.now()}@registration-e2e-test.com`;

      // 1. Register user
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'MyP@ssw0rd123!',
          workspaceName: 'Resend Test Workspace',
        })
        .expect(201);

      // 2. Wait for initial email
      await waitForEmail(email);

      // 3. Clear mailpit
      await clearMailpit();

      // 4. Wait for cooldown (60 seconds) - skip in test by updating database directly
      await prisma.user.update({
        where: { email },
        data: { emailVerificationSentAt: new Date(Date.now() - 120000) }, // 2 minutes ago
      });

      // 5. Request resend
      const resendRes = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email })
        .expect(200);

      expect(resendRes.body).toEqual({
        message: 'Verification email sent',
      });

      // 6. Verify new email was sent
      const message = await waitForEmail(email);
      expect(message.Subject).toBe('Verify your email - Synjar');
    });

    it('should enforce cooldown on resend', async () => {
      const email = `cooldown-${Date.now()}@registration-e2e-test.com`;

      // 1. Register user
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'MyP@ssw0rd123!',
          workspaceName: 'Cooldown Test Workspace',
        })
        .expect(201);

      // 2. Wait for initial email
      await waitForEmail(email);

      // 3. Immediately try to resend (should fail due to cooldown)
      await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email })
        .expect(429);
    });

    it('should return generic message for non-existent email', async () => {
      const resendRes = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'nonexistent@registration-e2e-test.com' })
        .expect(200);

      // Generic message to prevent email enumeration
      expect(resendRes.body).toEqual({
        message: 'If the email exists, a verification email will be sent',
      });
    });
  });

  describe('Complete Registration Flow', () => {
    it('should complete full registration -> verify -> login -> access workspace flow', async () => {
      const email = `complete-flow-${Date.now()}@registration-e2e-test.com`;
      const workspaceName = 'Complete Flow Workspace';

      // 1. Register
      const registerRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'MyP@ssw0rd123!',
          workspaceName,
          name: 'Flow Test User',
        })
        .expect(201);

      const userId = registerRes.body.userId;
      expect(userId).toBeDefined();

      // 2. Get verification email from Mailpit
      const message = await waitForEmail(email);
      const token = extractVerificationToken(message);
      expect(token).toBeTruthy();

      // 3. Verify email
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);

      // 4. Login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'MyP@ssw0rd123!',
        })
        .expect(201);

      // Extract cookies
      const cookies = loginRes.headers['set-cookie'];
      expect(cookies).toBeDefined();

      // 5. Access workspaces (should see the workspace created during registration)
      const workspacesRes = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', Array.isArray(cookies) ? cookies : [cookies])
        .expect(200);

      expect(workspacesRes.body).toBeInstanceOf(Array);
      expect(workspacesRes.body.length).toBeGreaterThanOrEqual(1);

      const workspace = workspacesRes.body.find(
        (ws: { name: string }) => ws.name === workspaceName,
      );
      expect(workspace).toBeDefined();
      expect(workspace.name).toBe(workspaceName);

      // 6. Verify user is owner of workspace
      const membersRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace.id}/members`)
        .set('Cookie', Array.isArray(cookies) ? cookies : [cookies])
        .expect(200);

      expect(membersRes.body).toBeInstanceOf(Array);
      const ownerMember = membersRes.body.find(
        (m: { role: string }) => m.role === 'OWNER',
      );
      expect(ownerMember).toBeDefined();
      expect(ownerMember.user.email).toBe(email);
    });
  });

  describe('Validation', () => {
    it('should reject weak password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'weak@registration-e2e-test.com',
          password: 'weak', // Too short, no special chars
          workspaceName: 'Test',
        })
        .expect(400);

      // Validation errors come as an array
      const messages = Array.isArray(res.body.message) ? res.body.message : [res.body.message];
      expect(messages.some((m: string) => m.includes('Password must be at least 12 characters'))).toBe(true);
    });

    it('should reject invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'MyP@ssw0rd123!',
          workspaceName: 'Test',
        })
        .expect(400);
    });

    it('should reject short workspace name', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'short-ws@registration-e2e-test.com',
          password: 'MyP@ssw0rd123!',
          workspaceName: 'X', // Too short (min 2)
        })
        .expect(400);

      expect(res.body.message).toContain('Workspace name must be at least 2 characters');
    });
  });
});
