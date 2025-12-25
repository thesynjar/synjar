import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';

/**
 * RLS E2E Integration Tests
 *
 * This test suite validates the complete Row Level Security (RLS) flow:
 * 1. JWT token generation and cookie handling
 * 2. RLS middleware extracting user context from JWT
 * 3. Database-level RLS policies enforcing data isolation
 * 4. HTTP responses reflecting proper authorization
 *
 * Test Pattern:
 * - Each test creates isolated users and workspaces
 * - Tests verify both positive (access granted) and negative (access denied) cases
 * - Database is cleaned between test runs to ensure isolation
 */
describe('RLS E2E Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    // Cleanup: delete test data
    // Note: Cleanup might fail due to RLS policies, but we try our best
    try {
      // Try to clean up test data
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          -- Delete TenantUserEmailLookup entries
          DELETE FROM "TenantUserEmailLookup"
          WHERE "workspaceId" IN (
            SELECT id FROM "Workspace"
            WHERE "createdById" IN (
              SELECT id FROM "User" WHERE email LIKE '%@rls-e2e-test.com'
            )
          );

          -- Delete WorkspaceMember entries
          DELETE FROM "WorkspaceMember"
          WHERE "workspaceId" IN (
            SELECT id FROM "Workspace"
            WHERE "createdById" IN (
              SELECT id FROM "User" WHERE email LIKE '%@rls-e2e-test.com'
            )
          );

          -- Delete Document entries
          DELETE FROM "Document"
          WHERE "workspaceId" IN (
            SELECT id FROM "Workspace"
            WHERE "createdById" IN (
              SELECT id FROM "User" WHERE email LIKE '%@rls-e2e-test.com'
            )
          );

          -- Delete Workspace entries
          DELETE FROM "Workspace"
          WHERE "createdById" IN (
            SELECT id FROM "User" WHERE email LIKE '%@rls-e2e-test.com'
          );

          -- Delete User entries
          DELETE FROM "User" WHERE email LIKE '%@rls-e2e-test.com';
        END $$;
      `);
    } catch (error) {
      console.warn('Cleanup failed (this is expected with RLS):', (error as Error).message);
      // Cleanup failure is not critical for tests
    } finally {
      await app.close();
    }
  });

  /**
   * Helper function: Register and login a user, return cookies for subsequent requests
   */
  async function createAuthenticatedUser(
    email: string,
    name: string = 'Test User',
  ): Promise<string[]> {
    // Register user
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'TestPass123!@#',
        name,
      })
      .expect(201);

    // Login and get cookies
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email,
        password: 'TestPass123!@#',
      })
      .expect(201);

    // Extract cookies from response
    const cookies = loginRes.headers['set-cookie'];
    if (!cookies) {
      throw new Error('No cookies returned from login');
    }

    // Ensure it's an array
    return Array.isArray(cookies) ? cookies : [cookies];
  }

  /**
   * Test 1: Unauthenticated requests should be rejected with 401
   */
  describe('Unauthenticated Access', () => {
    it('should reject unauthenticated workspace list request with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/workspaces');

      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated workspace creation request with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .send({ name: 'Test Workspace' });

      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated document list request with 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/workspaces/test-id/documents',
      );

      expect(res.status).toBe(401);
    });
  });

  /**
   * Test 2: Authenticated user should see only their own workspaces
   */
  describe('Workspace Isolation', () => {
    it('should allow authenticated user to create and see their own workspace', async () => {
      const userEmail = `user-own-workspace-${Date.now()}@rls-e2e-test.com`;
      const cookies = await createAuthenticatedUser(userEmail);

      // Create workspace
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies)
        .send({ name: 'My Workspace' })
        .expect(201);

      const workspaceId = createRes.body.id;
      expect(workspaceId).toBeDefined();
      expect(createRes.body.name).toBe('My Workspace');

      // List workspaces - should see the one we created
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', cookies)
        .expect(200);

      expect(listRes.body).toBeInstanceOf(Array);
      expect(listRes.body.length).toBeGreaterThan(0);

      const foundWorkspace = listRes.body.find(
        (ws: { id: string }) => ws.id === workspaceId,
      );
      expect(foundWorkspace).toBeDefined();
      expect(foundWorkspace.name).toBe('My Workspace');
    });

    it('should NOT allow user B to see user A\'s workspace', async () => {
      // Create User A and their workspace
      const userAEmail = `user-a-${Date.now()}@rls-e2e-test.com`;
      const cookiesA = await createAuthenticatedUser(userAEmail, 'User A');

      const workspaceARes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookiesA)
        .send({ name: 'Workspace A' })
        .expect(201);

      const workspaceAId = workspaceARes.body.id;

      // Create User B
      const userBEmail = `user-b-${Date.now()}@rls-e2e-test.com`;
      const cookiesB = await createAuthenticatedUser(userBEmail, 'User B');

      // User B lists workspaces - should NOT see Workspace A
      const listBRes = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', cookiesB)
        .expect(200);

      expect(listBRes.body).toBeInstanceOf(Array);

      const foundWorkspaceA = listBRes.body.find(
        (ws: { id: string }) => ws.id === workspaceAId,
      );
      expect(foundWorkspaceA).toBeUndefined();
    });

    it('should return 404 when user B tries to access user A\'s workspace by ID', async () => {
      // Create User A and their workspace
      const userAEmail = `user-a-direct-${Date.now()}@rls-e2e-test.com`;
      const cookiesA = await createAuthenticatedUser(userAEmail, 'User A');

      const workspaceARes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookiesA)
        .send({ name: 'Private Workspace A' })
        .expect(201);

      const workspaceAId = workspaceARes.body.id;

      // Create User B
      const userBEmail = `user-b-direct-${Date.now()}@rls-e2e-test.com`;
      const cookiesB = await createAuthenticatedUser(userBEmail, 'User B');

      // User B tries to access Workspace A directly - should get 404
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceAId}`)
        .set('Cookie', cookiesB)
        .expect(404);
    });
  });

  /**
   * Test 3: Workspace creation should set createdById correctly via RLS
   */
  describe('Workspace Creation with RLS', () => {
    it('should set createdById to authenticated user when creating workspace', async () => {
      const userEmail = `user-created-by-${Date.now()}@rls-e2e-test.com`;
      const cookies = await createAuthenticatedUser(userEmail);

      // Create workspace
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies)
        .send({ name: 'Workspace with CreatedBy' })
        .expect(201);

      const workspaceId = createRes.body.id;

      // We can't directly query createdById from database in tests because RLS prevents it
      // But we can verify that the workspace was created successfully and the API response is correct
      expect(workspaceId).toBeDefined();
      expect(createRes.body.name).toBe('Workspace with CreatedBy');

      // Verify the workspace is accessible (which proves createdById was set correctly,
      // as RLS policies check createdById = current_user_id() for INSERT)
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}`)
        .set('Cookie', cookies)
        .expect(200);

      expect(getRes.body.id).toBe(workspaceId);
    });

    it('should create workspace_members entry for creator automatically', async () => {
      const userEmail = `user-members-${Date.now()}@rls-e2e-test.com`;
      const cookies = await createAuthenticatedUser(userEmail);

      // Create workspace
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies)
        .send({ name: 'Workspace with Members' })
        .expect(201);

      const workspaceId = createRes.body.id;

      // Get members
      const membersRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/members`)
        .set('Cookie', cookies)
        .expect(200);

      expect(membersRes.body).toBeInstanceOf(Array);
      expect(membersRes.body.length).toBeGreaterThanOrEqual(1);

      // Creator should be an OWNER
      const creator = membersRes.body.find((m: { role: string }) => m.role === 'OWNER');
      expect(creator).toBeDefined();
    });
  });

  /**
   * Test 4: Document isolation - User A cannot access User B's documents
   *
   * Note: Document tests are currently skipped because document creation
   * requires file processing infrastructure (OpenAI embeddings, B2 storage)
   * which may not be available in test environment. The RLS policies for
   * documents work the same way as workspaces (via workspace_members).
   */
  describe.skip('Document Isolation', () => {
    it('should NOT allow user B to list documents from user A\'s workspace', async () => {
      // Create User A and workspace with document
      const userAEmail = `user-a-docs-${Date.now()}@rls-e2e-test.com`;
      const cookiesA = await createAuthenticatedUser(userAEmail, 'User A');

      const workspaceARes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookiesA)
        .send({ name: 'Workspace A Docs' })
        .expect(201);

      const workspaceAId = workspaceARes.body.id;

      // Create a document in Workspace A
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceAId}/documents`)
        .set('Cookie', cookiesA)
        .send({
          title: 'Private Document A',
          content: 'This is private content',
        })
        .expect(201);

      // Create User B
      const userBEmail = `user-b-docs-${Date.now()}@rls-e2e-test.com`;
      const cookiesB = await createAuthenticatedUser(userBEmail, 'User B');

      // User B tries to list documents from Workspace A - should get 404 (workspace not found)
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceAId}/documents`)
        .set('Cookie', cookiesB)
        .expect(404);
    });

    it('should NOT allow user B to access user A\'s document by ID', async () => {
      // Create User A and workspace with document
      const userAEmail = `user-a-doc-id-${Date.now()}@rls-e2e-test.com`;
      const cookiesA = await createAuthenticatedUser(userAEmail, 'User A');

      const workspaceARes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookiesA)
        .send({ name: 'Workspace A Doc ID' })
        .expect(201);

      const workspaceAId = workspaceARes.body.id;

      // Create a document in Workspace A
      const docARes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceAId}/documents`)
        .set('Cookie', cookiesA)
        .send({
          title: 'Secret Document',
          content: 'Top secret content',
        })
        .expect(201);

      const docAId = docARes.body.id;

      // Create User B
      const userBEmail = `user-b-doc-id-${Date.now()}@rls-e2e-test.com`;
      const cookiesB = await createAuthenticatedUser(userBEmail, 'User B');

      // User B tries to access Document A directly - should get 404
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceAId}/documents/${docAId}`)
        .set('Cookie', cookiesB)
        .expect(404);
    });

    it('should allow user A to access their own documents', async () => {
      // Create User A and workspace with document
      const userAEmail = `user-a-own-docs-${Date.now()}@rls-e2e-test.com`;
      const cookiesA = await createAuthenticatedUser(userAEmail, 'User A');

      const workspaceARes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookiesA)
        .send({ name: 'Workspace A Own Docs' })
        .expect(201);

      const workspaceAId = workspaceARes.body.id;

      // Create a document in Workspace A
      const docARes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceAId}/documents`)
        .set('Cookie', cookiesA)
        .send({
          title: 'My Document',
          content: 'My content',
        })
        .expect(201);

      const docAId = docARes.body.id;

      // User A lists documents - should see their document
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceAId}/documents`)
        .set('Cookie', cookiesA)
        .expect(200);

      expect(listRes.body.documents).toBeInstanceOf(Array);
      const foundDoc = listRes.body.documents.find(
        (doc: { id: string }) => doc.id === docAId,
      );
      expect(foundDoc).toBeDefined();
      expect(foundDoc.title).toBe('My Document');

      // User A accesses document by ID - should succeed
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceAId}/documents/${docAId}`)
        .set('Cookie', cookiesA)
        .expect(200);

      expect(getRes.body.id).toBe(docAId);
      expect(getRes.body.title).toBe('My Document');
    });
  });

  /**
   * Test 5: Multiple users, multiple workspaces - complete isolation
   */
  describe('Multi-User Multi-Workspace Isolation', () => {
    it('should maintain complete isolation between multiple users and workspaces', async () => {
      // Create User 1 with 2 workspaces
      const user1Email = `user1-multi-${Date.now()}@rls-e2e-test.com`;
      const cookies1 = await createAuthenticatedUser(user1Email, 'User 1');

      const ws1Res = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies1)
        .send({ name: 'User 1 Workspace 1' })
        .expect(201);

      const ws2Res = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies1)
        .send({ name: 'User 1 Workspace 2' })
        .expect(201);

      const ws1Id = ws1Res.body.id;
      const ws2Id = ws2Res.body.id;

      // Create User 2 with 1 workspace
      const user2Email = `user2-multi-${Date.now()}@rls-e2e-test.com`;
      const cookies2 = await createAuthenticatedUser(user2Email, 'User 2');

      const ws3Res = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies2)
        .send({ name: 'User 2 Workspace 1' })
        .expect(201);

      const ws3Id = ws3Res.body.id;

      // User 1 should see only their 2 workspaces
      const list1Res = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', cookies1)
        .expect(200);

      expect(list1Res.body).toBeInstanceOf(Array);
      const user1WorkspaceIds = list1Res.body.map((ws: { id: string }) => ws.id);
      expect(user1WorkspaceIds).toContain(ws1Id);
      expect(user1WorkspaceIds).toContain(ws2Id);
      expect(user1WorkspaceIds).not.toContain(ws3Id);

      // User 2 should see only their 1 workspace
      const list2Res = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', cookies2)
        .expect(200);

      expect(list2Res.body).toBeInstanceOf(Array);
      const user2WorkspaceIds = list2Res.body.map((ws: { id: string }) => ws.id);
      expect(user2WorkspaceIds).toContain(ws3Id);
      expect(user2WorkspaceIds).not.toContain(ws1Id);
      expect(user2WorkspaceIds).not.toContain(ws2Id);
    });
  });

  /**
   * Test 6: RLS bypass for system operations should not affect user requests
   */
  describe('System Operations vs User Operations', () => {
    it('should enforce RLS for user operations even if system bypass exists', async () => {
      const user1Email = `user1-system-${Date.now()}@rls-e2e-test.com`;
      const cookies1 = await createAuthenticatedUser(user1Email, 'User 1');

      const ws1Res = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies1)
        .send({ name: 'System Test Workspace 1' })
        .expect(201);

      const ws1Id = ws1Res.body.id;

      const user2Email = `user2-system-${Date.now()}@rls-e2e-test.com`;
      const cookies2 = await createAuthenticatedUser(user2Email, 'User 2');

      // User 2 should NOT see User 1's workspace (RLS enforced)
      const list2Res = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', cookies2)
        .expect(200);

      const user2WorkspaceIds = list2Res.body.map((ws: { id: string }) => ws.id);
      expect(user2WorkspaceIds).not.toContain(ws1Id);

      // User 2 should NOT be able to access User 1's workspace by ID
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${ws1Id}`)
        .set('Cookie', cookies2)
        .expect(404);
    });
  });
});
