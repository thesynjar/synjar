# Environment

This document describes the test environment isolation in Synjar Enterprise.

---

## Port Stack Strategy

Synjar Enterprise uses **62xx** ports for all services. Test environment uses **621x** ports to isolate from development **620x** ports:

| Service | Development | Test | Docker Service |
|---------|-------------|------|----------------|
| PostgreSQL | 6201 | 6211 | `postgres-test` |
| Mailpit SMTP | 6202 | 6212 | `mailpit-test` |
| Mailpit API | 6203 | 6213 | `mailpit-test` |
| API | 6201 | (via docker) | - |
| Web | 6210 | (Playwright) | - |

---

## Docker Compose Configuration

### Development Environment

```yaml
# community/docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "6201:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: synjar

  mailpit:
    image: axllent/mailpit
    ports:
      - "6202:1025"  # SMTP
      - "6203:8025"  # Web UI / API
```

### Test Environment

```yaml
# community/docker-compose.test.yml
services:
  postgres-test:
    image: pgvector/pgvector:pg16
    container_name: synjar-db-test
    ports:
      - "6211:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: synjar_test
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  mailpit-test:
    image: axllent/mailpit
    container_name: synjar-mailpit-test
    ports:
      - "6212:1025"  # SMTP
      - "6213:8025"  # Web UI / API
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1
```

---

## Environment Files

### Test Environment Variables

```bash
# community/apps/api/test/.env.test

# Database (test port 6211)
DATABASE_URL="postgresql://postgres:postgres@localhost:6211/synjar_test?schema=public"

# Mailpit (test ports 6212/6213)
SMTP_HOST="localhost"
SMTP_PORT="6212"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="test@synjar.local"

# JWT (test secrets only)
JWT_SECRET="test-jwt-secret-do-not-use-in-production"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# Deployment mode
DEPLOYMENT_MODE="cloud"

# Disable scheduled jobs during tests
ENABLE_CRON_JOBS="false"
```

---

## Starting Test Environment

### Manual Start

```bash
# Start test infrastructure
docker compose -f community/docker-compose.test.yml up -d

# Verify services are running
docker ps | grep synjar

# Check health
docker compose -f community/docker-compose.test.yml ps
```

### Automatic Start (via test scripts)

```bash
# E2E full test (starts/stops automatically)
pnpm --filter api test:e2e:full
```

---

## Environment Isolation

### Why Separate Environments?

1. **No data pollution**: Tests don't affect development data
2. **Parallel execution**: Run tests while developing
3. **Predictable state**: Clean database for each test run
4. **Port conflicts**: No collision between dev and test

### Isolation Rules

| Rule | Implementation |
|------|----------------|
| Separate databases | `synjar` (dev) vs `synjar_test` (test) |
| Separate ports | 620x (dev) vs 621x (test) |
| Separate containers | `synjar-db` vs `synjar-db-test` |
| Separate networks | `synjar` vs `synjar-test` |

---

## Database Management

### Test Database Setup

```bash
# Start test database
docker compose -f community/docker-compose.test.yml up -d postgres-test

# Run migrations
cd community/apps/api
dotenv -e test/.env.test -- npx prisma migrate deploy

# Seed test data (optional)
dotenv -e test/.env.test -- npx ts-node prisma/seed.ts
```

### Database Cleanup

```typescript
// test/helpers/clean-database.ts
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  // Disable foreign key checks temporarily
  await prisma.$executeRawUnsafe('SET session_replication_role = replica;');

  // Delete all data (order matters for foreign keys)
  await prisma.$transaction([
    prisma.document.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // Re-enable foreign key checks
  await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
}
```

---

## Mailpit for Email Testing

### Accessing Mailpit

| URL | Purpose |
|-----|---------|
| `http://localhost:6213` | Web UI (development) |
| `http://localhost:6213/api/v1/messages` | API (development) |
| Test: port 6213 | Same API, test instance |

### Mailpit API Helpers

```typescript
// test/helpers/mailpit.ts
const MAILPIT_API = process.env.MAILPIT_API || 'http://localhost:6213/api/v1';

export interface MailpitMessage {
  ID: string;
  From: { Name: string; Address: string };
  To: Array<{ Name: string; Address: string }>;
  Subject: string;
  Snippet: string;
}

export async function getMailpitMessages(): Promise<MailpitMessage[]> {
  const response = await fetch(`${MAILPIT_API}/messages`);
  if (!response.ok) throw new Error('Failed to fetch Mailpit messages');
  const data = await response.json();
  return data.messages || [];
}

export async function getMailpitMessage(id: string): Promise<any> {
  const response = await fetch(`${MAILPIT_API}/message/${id}`);
  if (!response.ok) throw new Error(`Failed to fetch message ${id}`);
  return response.json();
}

export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
}

export async function waitForEmail(
  toAddress: string,
  timeoutMs = 5000,
): Promise<MailpitMessage> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const messages = await getMailpitMessages();
    const found = messages.find(m =>
      m.To.some(t => t.Address === toAddress)
    );
    if (found) return found;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Email to ${toAddress} not received within ${timeoutMs}ms`);
}
```

### Using Mailpit in Tests

```typescript
describe('Registration Email', () => {
  beforeEach(async () => {
    await clearMailpit();
  });

  it('should send verification email after registration', async () => {
    // Act: Register user
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'Password123!' })
      .expect(201);

    // Assert: Verify email was sent
    const email = await waitForEmail('test@example.com');
    expect(email.Subject).toContain('Verify your email');
  });
});
```

---

## CI/CD Environment

### GitHub Actions

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: synjar_test
        ports:
          - 6211:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      mailpit:
        image: axllent/mailpit
        ports:
          - 6212:1025
          - 6213:8025
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:6211/synjar_test
      SMTP_HOST: localhost
      SMTP_PORT: 6212
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm test
```

### Woodpecker CI

```yaml
# .woodpecker/main.yml
steps:
  test:
    image: node:20
    commands:
      - corepack enable
      - pnpm install
      - cd community && pnpm test

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: synjar_test
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :6211

# Stop Docker containers
docker compose -f community/docker-compose.test.yml down

# Force remove container
docker rm -f synjar-db-test
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep synjar-db-test

# Check logs
docker logs synjar-db-test

# Test connection
PGPASSWORD=postgres psql -h localhost -p 6211 -U postgres -d synjar_test -c '\dt'
```

### Mailpit Not Receiving Emails

```bash
# Check Mailpit is running
docker ps | grep synjar-mailpit-test

# Check Mailpit logs
docker logs synjar-mailpit-test

# Verify SMTP settings
curl http://localhost:6213/api/v1/info
```

---

## Quick Reference

### Start Test Environment

```bash
docker compose -f community/docker-compose.test.yml up -d
```

### Stop Test Environment

```bash
docker compose -f community/docker-compose.test.yml down
```

### Reset Test Database

```bash
cd community/apps/api
dotenv -e test/.env.test -- npx prisma migrate reset --force --skip-seed
```

### View Test Emails

Open `http://localhost:6213` in browser (Mailpit UI)

---

**Last Updated**: 2025-12-27
