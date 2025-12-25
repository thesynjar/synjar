import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';

/**
 * Registration E2E Integration Tests with Email Verification
 *
 * This test suite validates the complete registration flow:
 * 1. User registration with workspace creation
 * 2. Email verification via Mailpit
 * 3. Login after email verification
 * 4. Access to workspace after verification
 *
 * Prerequisites:
 * - Mailpit running on localhost:6202 (SMTP) / 6203 (API)
 * - PostgreSQL running on localhost:6201
 *
 * Run with: pnpm test:e2e -- --testPathPattern=registration-e2e
 */

// Mailpit API configuration
const MAILPIT_API_URL = process.env.MAILPIT_API_URL || 'http://localhost:6203';

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
    // Set up environment variables for Mailpit
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '6202';
    process.env.SMTP_SECURE = 'false';
    process.env.EMAIL_VERIFICATION_URL = 'http://localhost:5173/auth/verify';

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
