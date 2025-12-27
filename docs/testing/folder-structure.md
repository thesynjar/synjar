# Folder Structure

This document describes where to place test files in Synjar Enterprise.

---

## Overview

```
enterprise/
├── docs/
│   └── testing/                        # Testing documentation (you are here)
│       ├── README.md
│       ├── test-types.md
│       ├── folder-structure.md
│       ├── configuration.md
│       ├── environment.md
│       └── patterns.md
├── community/                          # Community submodule
│   ├── apps/
│   │   ├── api/
│   │   │   ├── src/
│   │   │   │   └── modules/
│   │   │   │       └── auth/
│   │   │   │           ├── auth.service.ts
│   │   │   │           ├── auth.service.spec.ts          # Unit test
│   │   │   │           └── auth.service.integration.spec.ts  # Integration test
│   │   │   ├── test/
│   │   │   │   ├── registration.integration.spec.ts      # E2E API test
│   │   │   │   ├── fixtures/                             # Test data factories
│   │   │   │   │   ├── user.fixture.ts
│   │   │   │   │   └── workspace.fixture.ts
│   │   │   │   ├── helpers/                              # Test utilities
│   │   │   │   │   ├── clean-database.ts
│   │   │   │   │   └── mailpit.ts
│   │   │   │   ├── jest-e2e.json                         # E2E Jest config
│   │   │   │   ├── setup-env.ts                          # Environment setup
│   │   │   │   ├── globalSetup.ts                        # Jest global setup
│   │   │   │   ├── run-e2e.sh                            # E2E runner script
│   │   │   │   └── .env.test                             # Test environment variables
│   │   │   └── package.json                              # Jest config (inline)
│   │   └── web/
│   │       ├── src/
│   │       │   └── components/
│   │       │       └── Button/
│   │       │           ├── Button.tsx
│   │       │           └── Button.spec.ts                # Component unit test
│   │       ├── e2e/
│   │       │   ├── registration.spec.ts                  # Playwright E2E test
│   │       │   ├── helpers/
│   │       │   │   └── auth.ts                           # E2E helpers
│   │       │   └── fixtures/
│   │       │       └── test-users.json                   # E2E fixtures
│   │       ├── vitest.config.ts                          # Vitest config
│   │       └── playwright.config.ts                      # Playwright config
│   └── docker-compose.test.yml                           # Test infrastructure
└── packages/                           # Enterprise packages
    ├── billing/
    │   ├── src/
    │   │   └── billing.service.ts
    │   │   └── billing.service.spec.ts                   # Unit test
    │   └── package.json
    └── analytics/
        ├── src/
        └── package.json
```

---

## Placement Rules

### Rule 1: Unit Tests Next to Source

Unit tests live **next to the file they test**:

```
src/
├── modules/
│   └── auth/
│       ├── auth.service.ts
│       └── auth.service.spec.ts     # Unit test for auth.service.ts
│       ├── domain/
│       │   ├── password.value-object.ts
│       │   └── password.value-object.spec.ts
```

**Why**: Easy to find, encourages TDD, visible in file tree.

### Rule 2: Integration Tests Next to Source with Suffix

Integration tests use `.integration.spec.ts` suffix:

```
src/
├── modules/
│   └── auth/
│       ├── auth.service.ts
│       ├── auth.service.spec.ts           # Unit test
│       └── auth.service.integration.spec.ts  # Integration test
```

**Why**: Separates fast unit tests from slower integration tests.

### Rule 3: E2E API Tests in test/ Directory

E2E API tests go in `apps/api/test/`:

```
test/
├── registration.integration.spec.ts   # POST /auth/register
├── login.integration.spec.ts          # POST /auth/login
├── workspaces.integration.spec.ts     # /workspaces endpoints
├── fixtures/                          # Shared test data
│   └── user.fixture.ts
├── helpers/                           # Shared utilities
│   └── clean-database.ts
└── jest-e2e.json                      # E2E configuration
```

**Why**: Separated from source, uses different Jest config.

### Rule 4: E2E Web Tests in e2e/ Directory

Playwright tests go in `apps/web/e2e/`:

```
e2e/
├── registration.spec.ts               # Registration flow
├── login.spec.ts                      # Login flow
├── dashboard.spec.ts                  # Dashboard interactions
├── helpers/
│   └── auth.ts                        # Login helper
└── fixtures/
    └── test-users.json                # Test data
```

**Why**: Playwright default convention, separate from unit tests.

---

## File Naming Conventions

| Type | Suffix | Location | Example |
|------|--------|----------|---------|
| Unit | `.spec.ts` | Next to source | `auth.service.spec.ts` |
| Integration | `.integration.spec.ts` | Next to source | `auth.service.integration.spec.ts` |
| E2E API | `.integration.spec.ts` | `test/` folder | `registration.integration.spec.ts` |
| E2E Web | `.spec.ts` | `e2e/` folder | `registration.spec.ts` |

---

## Fixture Organization

### API Fixtures

```typescript
// test/fixtures/user.fixture.ts
import { PrismaService } from '@/prisma/prisma.service';

export interface CreateUserFixtureOptions {
  email?: string;
  password?: string;
  workspaceId?: string;
}

export async function createUserFixture(
  prisma: PrismaService,
  options: CreateUserFixtureOptions = {},
) {
  const defaults = {
    email: `test-${Date.now()}@example.com`,
    passwordHash: await hash('password123', 10),
    workspaceId: 'default-workspace-id',
  };

  return prisma.user.create({
    data: {
      ...defaults,
      email: options.email ?? defaults.email,
      // ...
    },
  });
}
```

### Web Fixtures

```typescript
// e2e/fixtures/test-users.json
{
  "admin": {
    "email": "admin@test.com",
    "password": "Admin123!"
  },
  "user": {
    "email": "user@test.com",
    "password": "User123!"
  }
}
```

---

## Helper Organization

### Database Helpers

```typescript
// test/helpers/clean-database.ts
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  // Order matters - delete in reverse of foreign key dependencies
  await prisma.$transaction([
    prisma.document.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.user.deleteMany(),
    // ...
  ]);
}
```

### Mailpit Helpers

```typescript
// test/helpers/mailpit.ts
const MAILPIT_API = 'http://localhost:6213/api/v1';

export async function getMailpitEmails(): Promise<Email[]> {
  const response = await fetch(`${MAILPIT_API}/messages`);
  const data = await response.json();
  return data.messages;
}

export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
}
```

### Playwright Helpers

```typescript
// e2e/helpers/auth.ts
import { Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', email);
  await page.fill('[data-testid="password"]', password);
  await page.click('[data-testid="submit"]');
  await page.waitForURL('/dashboard');
}
```

---

## Anti-Patterns

### DON'T: Tests in Separate Mirror Structure

```
# BAD
src/
├── modules/auth/auth.service.ts
tests/
├── modules/auth/auth.service.spec.ts  # Far from source
```

### DON'T: Mixed Test Types in Same Folder

```
# BAD
test/
├── auth.spec.ts              # Unit? Integration? E2E?
├── auth.test.ts              # Same thing, different name?
├── auth-integration.ts       # No .spec suffix
```

### DON'T: Fixtures Scattered Everywhere

```
# BAD
src/auth/fixtures.ts          # Fixtures in source
test/registration.spec.ts     # Uses inline fixtures
test/login.spec.ts           # Uses different inline fixtures
```

---

## Migration Guide

When adding tests to existing code:

1. **New unit test**: Create `filename.spec.ts` next to source file
2. **New integration test**: Create `filename.integration.spec.ts` next to source file
3. **New E2E API test**: Add to `test/*.integration.spec.ts`
4. **New E2E Web test**: Add to `e2e/*.spec.ts`
5. **New fixture**: Add to appropriate `fixtures/` folder
6. **New helper**: Add to appropriate `helpers/` folder

---

**Last Updated**: 2025-12-27
