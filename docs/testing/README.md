# Testing Strategy

> "Testuj zachowanie, nie implementację; preferuj szybkie unit/integration z realnymi adapterami (mockuj tylko zewnętrzne API)."
>
> — CLAUDE.md

## Philosophy

Synjar Enterprise follows DDD testing principles:

1. **Test behavior, not implementation** - Verify "what" the code does, not "how"
2. **Prefer real adapters** - Use real DB, real Mailpit SMTP, not mocks
3. **Mock only external APIs** - Stripe, email providers (production), third-party APIs
4. **NEVER mock aggregates** - They contain business logic
5. **Follow AAA pattern** - Arrange, Act, Assert
6. **Use named constants** - No magic values

---

## Quick Start

### Prerequisites

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Verify Docker is running**:
   ```bash
   docker info
   ```

3. **Setup test environment**:
   ```bash
   docker compose -f community/docker-compose.test.yml up -d
   ```

### Running Tests

| Command | Description | Speed |
|---------|-------------|-------|
| `pnpm test` | Unit tests only | ~5s |
| `pnpm test:all` | Unit + Integration + E2E | ~60s |
| `pnpm test:e2e` | E2E tests only | ~30s |

---

## Test Types Overview

| Type | Location | Framework | Purpose |
|------|----------|-----------|---------|
| **Unit** | `src/**/*.spec.ts` | Jest | Pure business logic (aggregates, value objects) |
| **Integration** | `src/**/*.integration.spec.ts` | Jest | Component integration with real DB |
| **E2E API** | `test/*.integration.spec.ts` | Jest + Supertest | Full HTTP API testing |
| **E2E Web** | `e2e/*.spec.ts` | Playwright | Complete user journeys |

See: [Test Types](./test-types.md)

---

## Test Environment Isolation

### Port Stack Strategy

The project uses **62xx** ports for test environment to avoid conflicts with development:

| Service | Dev Port | Test Port |
|---------|----------|-----------|
| PostgreSQL | 6201 | 6211 |
| Mailpit SMTP | 6202 | 6212 |
| Mailpit API | 6203 | 6213 |
| API | 6201 | 6211 (via Docker) |
| Web | 6210 | - (Playwright manages) |

See: [Environment](./environment.md)

---

## Test Isolation Strategy

**CRITICAL**: Every test must be fully isolated and deterministic.

### Setup/Cleanup Pattern

```typescript
describe('MyService', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // ONLY: Create test environment (DB connection, module)
    // NO data seeding here!
    module = await Test.createTestingModule({ ... }).compile();
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    // 1. Clean ALL data from database
    await cleanDatabase(prisma);

    // 2. Seed ONLY data needed for THIS specific test
    await setupTestData();  // minimal data for this test
  });

  afterEach(async () => {
    // Clean ALL data after test
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    // ONLY: Close connections
    await prisma.$disconnect();
    await module.close();
  });
});
```

### Rules

1. **beforeAll**: ONLY setup environment (connections, module) - **NO** data seeding!
2. **beforeEach**: `cleanDatabase()` -> seed MINIMUM data needed
3. **Test body**: Seed test-specific data (Arrange)
4. **afterEach**: `cleanDatabase()` - clean everything
5. **afterAll**: ONLY close connections

See: [Patterns](./patterns.md)

---

## Coverage Requirements

Based on CLAUDE.md principles:

| Code Type | Coverage | Reasoning |
|-----------|----------|-----------|
| **Aggregates** | 100% public methods | Core business logic |
| **Value Objects** | 100% validation | Self-validating, critical |
| **Domain Services** | 100% | Cross-aggregate logic |
| **Use Cases** | 80%+ main paths | Orchestration layer |
| **Controllers** | E2E tests only | Thin layer |
| **DTOs** | Only if validation logic | Pure data transfer |
| **Repositories** | Integration tests | Test with real DB |

---

## Mocking Strategy

### What to Mock (ONLY external APIs)

```typescript
jest.mock('stripe', () => ({
  Stripe: jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test_123' }),
      },
    },
  })),
}));
```

**Mock these**:
- Stripe SDK
- External email providers (SendGrid, etc.)
- Third-party APIs

### What NOT to Mock

**NEVER mock**:
- Aggregates (contain business logic)
- Value Objects
- Domain Services
- Repositories (use real DB in integration tests)
- Internal services

See: [Patterns](./patterns.md)

---

## Folder Structure

```
community/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   └── **/*.spec.ts           # Unit tests
│   │   │   └── **/*.integration.spec.ts # Integration tests
│   │   ├── test/
│   │   │   ├── *.integration.spec.ts  # E2E API tests
│   │   │   ├── fixtures/              # Test data factories
│   │   │   ├── helpers/               # Test utilities
│   │   │   └── jest-e2e.json          # E2E config
│   │   └── jest.config.json           # Unit test config (in package.json)
│   └── web/
│       ├── src/
│       │   └── **/*.spec.ts           # Component unit tests
│       ├── e2e/
│       │   └── *.spec.ts              # Playwright E2E tests
│       ├── vitest.config.ts           # Unit test config
│       └── playwright.config.ts       # E2E config
└── docker-compose.test.yml            # Test infrastructure
```

See: [Folder Structure](./folder-structure.md)

---

## Test Commands Reference

### Root (Enterprise)

```bash
pnpm test              # Run all unit tests via Turbo
pnpm test:all          # Run all tests (unit + integration + E2E)
pnpm test:e2e          # Run E2E tests only
```

### API (Community)

```bash
pnpm --filter api test           # Unit tests
pnpm --filter api test:watch     # Watch mode (TDD)
pnpm --filter api test:cov       # With coverage report
pnpm --filter api test:e2e       # E2E API tests
pnpm --filter api test:e2e:full  # E2E with setup/teardown
pnpm --filter api test:all       # Unit + E2E
```

### Web (Community)

```bash
pnpm --filter @synjar/web test           # Unit tests (Vitest)
pnpm --filter @synjar/web test:watch     # Watch mode
pnpm --filter @synjar/web test:e2e       # Playwright E2E
pnpm --filter @synjar/web test:e2e:ui    # Playwright UI mode
pnpm --filter @synjar/web test:e2e:headed # Headed browser
```

---

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
lsof -i :6211

# Stop test containers
docker compose -f community/docker-compose.test.yml down
```

### Test Database Connection Issues

```bash
# Reset test database
cd community/apps/api
dotenv -e test/.env.test -- npx prisma db push --skip-generate
dotenv -e test/.env.test -- npm run prisma:seed
```

### Flaky Tests

**Common causes**:
1. **Race conditions** - Use `waitFor` patterns
2. **Shared state** - Clean up after each test
3. **Network timeouts** - Increase timeout for integration tests

**Solution**:
```typescript
// Use cleanup
afterEach(async () => {
  await cleanDatabase(prisma);
});

// Increase timeout for integration tests
jest.setTimeout(30000); // 30 seconds
```

---

## Detailed Guides

- [Test Types](./test-types.md) - When to use unit vs integration vs E2E
- [Folder Structure](./folder-structure.md) - Where to put test files
- [Configuration](./configuration.md) - Jest, Vitest, Playwright configs
- [Environment](./environment.md) - Test environment isolation (62xx ports)
- [Patterns](./patterns.md) - Fixtures, mocking, cleanup patterns

---

## Contributing

When adding new tests:

1. **Choose the right test type** - Use the table above
2. **Follow AAA pattern** - Arrange, Act, Assert
3. **Use named constants** - No magic values
4. **Test behavior, not implementation** - Verify outcomes
5. **Document complex tests** - Add comments explaining the scenario

**Example**:
```typescript
/**
 * Regression test for: "Registration fails silently when email not sent"
 *
 * Bug: Email queue processor didn't handle SMTP failures gracefully.
 *
 * @group e2e
 * @group regression
 */
describe('Registration Email Flow', () => {
  // ... tests
});
```

---

**Last Updated**: 2025-12-27
**Status**: Active Development
