# Test Types

This document describes when and how to use each type of test in Synjar Enterprise.

---

## Overview

| Type | Speed | Isolation | Real Services | Use Case |
|------|-------|-----------|---------------|----------|
| Unit | Fast (~ms) | Complete | None | Business logic |
| Integration | Medium (~s) | Partial | DB, Mailpit | Service integration |
| E2E API | Slow (~s) | None | All | HTTP endpoints |
| E2E Web | Slowest (~s) | None | All | User journeys |

---

## Unit Tests

### Characteristics

- **Location**: `src/**/*.spec.ts`
- **Framework**: Jest (API), Vitest (Web)
- **Speed**: Very fast (~1-10ms per test)
- **Dependencies**: Mocked via DI
- **Database**: None

### When to Use

- Testing pure business logic
- Aggregates and their methods
- Value Objects validation
- Domain Services
- Utility functions

### Example

```typescript
// src/modules/auth/domain/password.value-object.spec.ts
describe('Password Value Object', () => {
  it('should reject password shorter than 8 characters', () => {
    expect(() => Password.create('short')).toThrow('Password must be at least 8 characters');
  });

  it('should accept valid password', () => {
    const password = Password.create('ValidPassword123!');
    expect(password.value).toBeDefined();
  });
});
```

### Best Practices

- Test one behavior per test
- Use descriptive test names: `should [expected behavior] when [condition]`
- No database, no HTTP, no file system
- Mock dependencies via dependency injection

---

## Integration Tests

### Characteristics

- **Location**: `src/**/*.integration.spec.ts`
- **Framework**: Jest with real adapters
- **Speed**: Medium (~100-500ms per test)
- **Dependencies**: Real DB, real Mailpit
- **Excluded from**: Default `npm run test`

### When to Use

- Testing repository implementations
- Service integration with database
- Email sending (via Mailpit)
- Multi-tenant isolation (RLS)
- Event handlers

### Example

```typescript
// src/modules/auth/user.repository.integration.spec.ts
describe('UserRepository (Integration)', () => {
  let prisma: PrismaService;
  let repository: UserRepository;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [UserRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<UserRepository>(UserRepository);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('should find user by email', async () => {
    // Arrange
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: 'hash',
        workspaceId: 'workspace-1',
      },
    });

    // Act
    const found = await repository.findByEmail('test@example.com');

    // Assert
    expect(found?.id).toBe(user.id);
  });
});
```

### Configuration

Integration tests are excluded from unit test runs:

```json
// package.json (jest config)
{
  "testPathIgnorePatterns": [
    "\\.integration\\.spec\\.ts$"
  ]
}
```

Run integration tests separately:

```bash
pnpm --filter api test -- --testPathPattern=integration
```

---

## E2E API Tests

### Characteristics

- **Location**: `test/*.integration.spec.ts`
- **Framework**: Jest + Supertest
- **Speed**: Slow (~1-5s per test)
- **Dependencies**: Full stack (DB, API server)
- **Configuration**: `test/jest-e2e.json`

### When to Use

- Testing HTTP endpoints
- Request/response validation
- Authentication flows
- API error handling
- Multi-step API workflows

### Example

```typescript
// test/registration.integration.spec.ts
describe('POST /auth/register', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should register new user and send verification email', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'newuser@example.com',
        password: 'ValidPassword123!',
      })
      .expect(201);

    expect(response.body.message).toBe('Verification email sent');

    // Verify email was sent via Mailpit API
    const emails = await getMailpitEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('newuser@example.com');
  });
});
```

### Running

```bash
pnpm --filter api test:e2e
```

---

## E2E Web Tests (Playwright)

### Characteristics

- **Location**: `e2e/*.spec.ts`
- **Framework**: Playwright
- **Speed**: Slowest (~5-30s per test)
- **Dependencies**: Full stack (DB, API, Web)
- **Browser**: Chromium (configurable)

### When to Use

- Complete user journeys
- UI interactions
- Form submissions
- Navigation flows
- Visual regression (optional)

### Example

```typescript
// e2e/registration.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Registration Flow', () => {
  test('should register and redirect to dashboard', async ({ page }) => {
    // Navigate to registration
    await page.goto('/register');

    // Fill form
    await page.fill('[data-testid="email"]', 'newuser@example.com');
    await page.fill('[data-testid="password"]', 'ValidPassword123!');

    // Submit
    await page.click('[data-testid="submit"]');

    // Verify redirect
    await expect(page).toHaveURL(/\/verify-email/);
    await expect(page.locator('h1')).toContainText('Check your email');
  });
});
```

### Running

```bash
pnpm --filter @synjar/web test:e2e        # Headless
pnpm --filter @synjar/web test:e2e:headed # With browser
pnpm --filter @synjar/web test:e2e:ui     # Playwright UI
```

---

## Decision Matrix

Use this matrix to choose the right test type:

| Question | Unit | Integration | E2E API | E2E Web |
|----------|------|-------------|---------|---------|
| Tests business logic only? | YES | - | - | - |
| Needs real database? | NO | YES | YES | YES |
| Tests HTTP endpoint? | NO | NO | YES | - |
| Tests user interface? | NO | NO | NO | YES |
| Tests complete flow? | NO | NO | YES | YES |
| Mock external APIs? | YES | YES | YES | NO |

---

## Test Naming Conventions

### File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Unit | `*.spec.ts` | `password.value-object.spec.ts` |
| Integration | `*.integration.spec.ts` | `user.repository.integration.spec.ts` |
| E2E API | `*.integration.spec.ts` (in test/) | `registration.integration.spec.ts` |
| E2E Web | `*.spec.ts` (in e2e/) | `registration.spec.ts` |

### Test Description

```typescript
// Unit: describe class/function, it describes behavior
describe('Password Value Object', () => {
  it('should reject password shorter than 8 characters', () => {});
});

// Integration: describe integration point
describe('UserRepository (Integration)', () => {
  it('should find user by email with case-insensitive search', () => {});
});

// E2E: describe endpoint or user journey
describe('POST /auth/register', () => {
  it('should register new user and send verification email', () => {});
});

describe('Registration Flow', () => {
  test('should register and redirect to dashboard', async () => {});
});
```

---

## Coverage by Test Type

| Code Layer | Primary Test Type | Secondary |
|------------|-------------------|-----------|
| Value Objects | Unit | - |
| Aggregates | Unit | Integration |
| Domain Services | Unit | - |
| Repositories | Integration | - |
| Use Cases | Integration | E2E API |
| Controllers | E2E API | - |
| DTOs | Unit (if validation) | - |
| UI Components | Unit (Vitest) | E2E Web |
| User Journeys | E2E Web | - |

---

**Last Updated**: 2025-12-27
