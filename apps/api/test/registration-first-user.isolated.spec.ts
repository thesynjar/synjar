import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';

/**
 * Registration First User E2E Tests (Self-Hosted Mode)
 *
 * ISOLATION REQUIRED: This test file must run in isolation (not parallel)
 * because it requires an empty database to test "first user" behavior.
 *
 * Run with: pnpm test:e2e:first-user
 * (configured to run with --runInBand)
 *
 * This tests:
 * - REQ-S1: First user becomes admin automatically
 * - REQ-S2: First user gets instant verification (no email required)
 *
 * Spec: docs/specifications/2025-12-26-dual-mode-registration.md
 */

// Unique domain for cleanup
const TEST_EMAIL_DOMAIN = '@first-user-test.com';

describe('Registration - First User (Self-Hosted Mode)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [await AppModule.forRoot()],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Cleanup only this test's data
    try {
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          DELETE FROM "WorkspaceMember"
          WHERE "workspaceId" IN (
            SELECT id FROM "Workspace"
            WHERE "createdById" IN (
              SELECT id FROM "User" WHERE email LIKE '%${TEST_EMAIL_DOMAIN}'
            )
          );

          DELETE FROM "Workspace"
          WHERE "createdById" IN (
            SELECT id FROM "User" WHERE email LIKE '%${TEST_EMAIL_DOMAIN}'
          );

          DELETE FROM "User" WHERE email LIKE '%${TEST_EMAIL_DOMAIN}';
        END $$;
      `);
    } catch (error) {
      console.warn('Cleanup failed:', (error as Error).message);
    } finally {
      await app.close();
    }
  });

  beforeEach(async () => {
    process.env.DEPLOYMENT_MODE = 'self-hosted';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';

    // IMPORTANT: This test requires empty database state
    // It must run in isolation (--runInBand), not parallel with other tests
    await prisma.$executeRawUnsafe(`
      DELETE FROM "WorkspaceMember";
      DELETE FROM "Workspace";
      DELETE FROM "User";
    `);
  });

  it('should allow first user registration without verification and instant admin access (REQ-S1, REQ-S2)', async () => {
    const email = `admin-${Date.now()}${TEST_EMAIL_DOMAIN}`;

    // 1. Register first user
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'SecurePass123!',
        workspaceName: 'Admin Workspace',
        name: 'First Admin User',
      })
      .expect(201);

    // 2. Check response - should get instant login tokens
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
