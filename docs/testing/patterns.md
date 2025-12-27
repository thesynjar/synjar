# Patterns

This document describes common testing patterns used in Synjar Enterprise.

---

## AAA Pattern (Arrange-Act-Assert)

Every test should follow the AAA pattern:

```typescript
it('should activate subscription when payment confirmed', () => {
  // Arrange - setup test data
  const subscription = Subscription.create({
    tenantId: 'tenant-1',
    plan: 'premium',
    status: 'pending',
  });

  // Act - perform action
  subscription.activate();

  // Assert - verify behavior
  expect(subscription.status).toBe('active');
  expect(subscription.domainEvents).toContainEqual(
    expect.objectContaining({ type: 'SubscriptionActivated' })
  );
});
```

---

## Test Isolation

### Database Cleanup

```typescript
// test/helpers/clean-database.ts
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  // Order matters - delete in reverse of foreign key dependencies
  await prisma.$transaction([
    prisma.document.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
```

### Using Cleanup in Tests

```typescript
describe('UserService', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    // Setup only
    const module = await Test.createTestingModule({...}).compile();
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

---

## Fixtures

### Factory Pattern

```typescript
// test/fixtures/user.fixture.ts
import { PrismaService } from '@/prisma/prisma.service';
import { hash } from 'bcrypt';

export interface CreateUserOptions {
  email?: string;
  password?: string;
  workspaceId?: string;
  isVerified?: boolean;
}

export async function createUserFixture(
  prisma: PrismaService,
  options: CreateUserOptions = {},
) {
  const defaults = {
    email: `test-${Date.now()}@example.com`,
    password: 'Password123!',
    workspaceId: null,
    isVerified: true,
  };

  const merged = { ...defaults, ...options };
  const passwordHash = await hash(merged.password, 10);

  return prisma.user.create({
    data: {
      email: merged.email,
      passwordHash,
      isVerified: merged.isVerified,
      workspaceId: merged.workspaceId,
    },
  });
}
```

### Workspace Fixture

```typescript
// test/fixtures/workspace.fixture.ts
export interface CreateWorkspaceOptions {
  name?: string;
  ownerId?: string;
}

export async function createWorkspaceFixture(
  prisma: PrismaService,
  options: CreateWorkspaceOptions = {},
) {
  const defaults = {
    name: `Test Workspace ${Date.now()}`,
  };

  return prisma.workspace.create({
    data: {
      name: options.name ?? defaults.name,
      ownerId: options.ownerId,
    },
  });
}
```

### Using Fixtures

```typescript
describe('DocumentService', () => {
  it('should create document for user', async () => {
    // Arrange - use fixtures
    const workspace = await createWorkspaceFixture(prisma);
    const user = await createUserFixture(prisma, {
      workspaceId: workspace.id,
    });

    // Act
    const document = await documentService.create({
      title: 'Test Document',
      userId: user.id,
    });

    // Assert
    expect(document.workspaceId).toBe(workspace.id);
  });
});
```

---

## Mocking Strategy

### External API Mocks

```typescript
// test/mocks/stripe.mock.ts
export const mockStripe = {
  customers: {
    create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
    retrieve: jest.fn().mockResolvedValue({ id: 'cus_test123', email: 'test@example.com' }),
  },
  subscriptions: {
    create: jest.fn().mockResolvedValue({
      id: 'sub_test123',
      status: 'active',
    }),
    cancel: jest.fn().mockResolvedValue({
      id: 'sub_test123',
      status: 'canceled',
    }),
  },
  checkout: {
    sessions: {
      create: jest.fn().mockResolvedValue({
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/test',
      }),
    },
  },
};

// Usage in test
jest.mock('stripe', () => ({
  Stripe: jest.fn(() => mockStripe),
}));
```

### Module Mock Override

```typescript
describe('BillingService', () => {
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [BillingModule],
    })
      .overrideProvider('STRIPE_CLIENT')
      .useValue(mockStripe)
      .compile();

    service = module.get<BillingService>(BillingService);
  });
});
```

### What to Mock

| Mock | Don't Mock |
|------|------------|
| Stripe SDK | Aggregates |
| External APIs | Value Objects |
| Email providers | Domain Services |
| Third-party services | Repositories (use real DB) |

---

## Async Testing

### Waiting for Events

```typescript
// Wait for async operation
async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  options: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const { timeout = 5000, interval = 100 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await new Promise(r => setTimeout(r, interval));
  }

  throw new Error(`waitFor timeout after ${timeout}ms`);
}

// Usage
it('should process email verification', async () => {
  await authService.sendVerificationEmail(user.id);

  const token = await waitFor(async () =>
    prisma.emailVerificationToken.findFirst({
      where: { userId: user.id },
    })
  );

  expect(token).toBeDefined();
});
```

### Email Waiting

```typescript
// test/helpers/mailpit.ts
export async function waitForEmail(
  toAddress: string,
  timeoutMs = 5000,
): Promise<MailpitMessage> {
  return waitFor(
    async () => {
      const messages = await getMailpitMessages();
      return messages.find(m =>
        m.To.some(t => t.Address === toAddress)
      );
    },
    { timeout: timeoutMs }
  );
}
```

---

## E2E API Testing

### Request Helper

```typescript
// test/helpers/request.ts
import * as supertest from 'supertest';

export function createRequest(app: INestApplication) {
  return supertest(app.getHttpServer());
}

export async function loginAndGetToken(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const response = await createRequest(app)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return response.body.accessToken;
}
```

### Authenticated Requests

```typescript
describe('Protected Endpoints', () => {
  let accessToken: string;

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const user = await createUserFixture(prisma, {
      email: 'test@example.com',
      password: 'Password123!',
    });
    accessToken = await loginAndGetToken(app, 'test@example.com', 'Password123!');
  });

  it('should return user profile', async () => {
    await createRequest(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(res => {
        expect(res.body.email).toBe('test@example.com');
      });
  });
});
```

---

## Playwright Patterns

### Page Object Pattern

```typescript
// e2e/pages/login.page.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="email"]');
    this.passwordInput = page.locator('[data-testid="password"]');
    this.submitButton = page.locator('[data-testid="submit"]');
    this.errorMessage = page.locator('[data-testid="error"]');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

### Using Page Objects

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';

test.describe('Login', () => {
  test('should login successfully', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('test@example.com', 'Password123!');

    await expect(page).toHaveURL('/dashboard');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('wrong@example.com', 'wrongpassword');

    await expect(loginPage.errorMessage).toBeVisible();
  });
});
```

### Auth Helper

```typescript
// e2e/helpers/auth.ts
import { Page } from '@playwright/test';

export async function login(
  page: Page,
  email = 'test@example.com',
  password = 'Password123!',
) {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', email);
  await page.fill('[data-testid="password"]', password);
  await page.click('[data-testid="submit"]');
  await page.waitForURL('/dashboard');
}

export async function logout(page: Page) {
  await page.click('[data-testid="user-menu"]');
  await page.click('[data-testid="logout"]');
  await page.waitForURL('/login');
}
```

---

## Regression Test Pattern

```typescript
/**
 * Regression test for: "Registration fails silently when SMTP unavailable"
 *
 * Bug: Email queue processor didn't handle SMTP failures gracefully,
 * causing user to be created but verification email never sent.
 *
 * Fix: Added retry logic and proper error handling in email queue.
 *
 * @group regression
 * @see https://github.com/synjar/synjar-enterprise/issues/123
 */
describe('[REGRESSION] Registration Email Handling', () => {
  it('should mark registration as pending when email fails', async () => {
    // Arrange: Mock SMTP to fail
    mockSmtpToFail();

    // Act: Register user
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Password123!',
      })
      .expect(201);

    // Assert: User created but not verified
    const user = await prisma.user.findUnique({
      where: { email: 'test@example.com' },
    });
    expect(user).toBeDefined();
    expect(user.isVerified).toBe(false);

    // Assert: Email queued for retry
    const emailJob = await prisma.emailQueue.findFirst({
      where: { to: 'test@example.com' },
    });
    expect(emailJob.status).toBe('pending');
    expect(emailJob.retryCount).toBe(0);
  });
});
```

---

## Named Constants

### DON'T: Magic Values

```typescript
// BAD
const response = await request(app)
  .post('/auth/login')
  .send({ email: 'test@example.com', password: 'password' })
  .expect(200);

expect(token).toHaveProperty('expiresIn', 3600);
```

### DO: Named Constants

```typescript
// GOOD
const TEST_USER = {
  email: 'test@example.com',
  password: 'Password123!',
} as const;

const JWT_EXPIRY_SECONDS = 3600;

const response = await request(app)
  .post('/auth/login')
  .send(TEST_USER)
  .expect(200);

expect(token).toHaveProperty('expiresIn', JWT_EXPIRY_SECONDS);
```

---

## Error Testing

### Testing Exceptions

```typescript
it('should throw error for invalid email', () => {
  expect(() => EmailAddress.create('invalid')).toThrow('Invalid email format');
});

it('should throw specific error type', () => {
  expect(() => EmailAddress.create('invalid')).toThrow(ValidationError);
});
```

### Testing HTTP Errors

```typescript
it('should return 401 for invalid credentials', async () => {
  await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'test@example.com', password: 'wrong' })
    .expect(401)
    .expect(res => {
      expect(res.body.message).toBe('Invalid credentials');
    });
});

it('should return 404 when workspace not found', async () => {
  await request(app.getHttpServer())
    .get('/workspaces/non-existent-id')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(404)
    .expect(res => {
      expect(res.body.message).toBe('Workspace not found');
    });
});
```

---

**Last Updated**: 2025-12-27
