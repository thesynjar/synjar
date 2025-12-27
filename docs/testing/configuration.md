# Configuration

This document describes the test configuration for Synjar Enterprise.

---

## Overview

| App | Framework | Config Location |
|-----|-----------|-----------------|
| API (Unit) | Jest | `package.json` (inline) |
| API (E2E) | Jest + Supertest | `test/jest-e2e.json` |
| Web (Unit) | Vitest | `vitest.config.ts` |
| Web (E2E) | Playwright | `playwright.config.ts` |

---

## Jest Configuration (API)

### Unit Tests

Configuration is inline in `community/apps/api/package.json`:

```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "testPathIgnorePatterns": [
      "/node_modules/",
      "\\.integration\\.spec\\.ts$"
    ],
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": [
      "**/*.(t|j)s",
      "!**/*.spec.ts",
      "!**/*.integration.spec.ts",
      "!**/*.d.ts",
      "!**/node_modules/**",
      "!**/dist/**"
    ],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node",
    "moduleNameMapper": {
      "^@/(.*)$": "<rootDir>/$1"
    }
  }
}
```

**Key settings**:
- `testRegex`: Matches `*.spec.ts` files
- `testPathIgnorePatterns`: Excludes `.integration.spec.ts` from unit runs
- `moduleNameMapper`: Enables `@/` path alias

### E2E Tests

Configuration in `community/apps/api/test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".integration.spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "setupFilesAfterEnv": ["./setup-env.ts"],
  "globalSetup": "./globalSetup.ts",
  "testTimeout": 30000,
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/../src/$1"
  }
}
```

**Key settings**:
- `testRegex`: Matches `.integration.spec.ts` files
- `setupFilesAfterEnv`: Loads environment variables
- `globalSetup`: Runs before all tests (DB setup)
- `testTimeout`: 30 seconds for slow operations

---

## Vitest Configuration (Web)

Configuration in `community/apps/web/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'e2e', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Key settings**:
- `environment`: Uses jsdom for DOM testing
- `globals`: Enables global `describe`, `it`, `expect`
- `exclude`: Excludes E2E tests from unit runs
- `alias`: Enables `@/` path alias

### Setup File

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});
```

---

## Playwright Configuration (Web E2E)

Configuration in `community/apps/web/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:6210',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:6210',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

**Key settings**:
- `fullyParallel: false`: Sequential tests (avoids token conflicts)
- `workers: 1`: Single worker for consistency
- `webServer`: Auto-starts dev server
- `baseURL`: Points to dev server

---

## Environment Variables

### Test Environment (.env.test)

Location: `community/apps/api/test/.env.test`

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:6211/synjar_test?schema=public"

# Mailpit (for email testing)
SMTP_HOST="localhost"
SMTP_PORT="6212"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="test@synjar.local"

# JWT
JWT_SECRET="test-jwt-secret-do-not-use-in-production"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# Deployment mode
DEPLOYMENT_MODE="cloud"

# Disable features for testing
ENABLE_CRON_JOBS="false"
```

### Loading Environment

```typescript
// test/setup-env.ts
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.resolve(__dirname, '.env.test'),
});
```

---

## Path Aliases

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@test/*": ["./test/*"]
    }
  }
}
```

### Usage in Tests

```typescript
// Using path aliases
import { AuthService } from '@/modules/auth/auth.service';
import { createUserFixture } from '@test/fixtures/user.fixture';
```

---

## Coverage Configuration

### Jest Coverage

```bash
# Run with coverage
pnpm --filter api test:cov

# Output
# - console: Summary table
# - coverage/: HTML report
# - coverage/lcov.info: CI/CD compatible
```

### Vitest Coverage

```bash
# Run with coverage
pnpm --filter @synjar/web test -- --coverage

# Output
# - console: Summary table
# - coverage/: HTML report
```

---

## Running Specific Tests

### Jest (API)

```bash
# Run single file
pnpm --filter api test -- auth.service.spec.ts

# Run tests matching pattern
pnpm --filter api test -- --testNamePattern="should authenticate"

# Run in watch mode
pnpm --filter api test:watch
```

### Vitest (Web)

```bash
# Run single file
pnpm --filter @synjar/web test -- Button.spec.ts

# Run in watch mode
pnpm --filter @synjar/web test:watch
```

### Playwright (Web E2E)

```bash
# Run single file
pnpm --filter @synjar/web test:e2e -- registration.spec.ts

# Run with UI
pnpm --filter @synjar/web test:e2e:ui

# Debug mode
pnpm --filter @synjar/web test:e2e -- --debug
```

---

## Timeout Configuration

### Jest Timeouts

```typescript
// Per-test timeout
it('should complete within time', async () => {
  // ...
}, 10000); // 10 seconds

// Global timeout in jest-e2e.json
{
  "testTimeout": 30000
}

// Per-describe timeout
beforeAll(() => {
  jest.setTimeout(60000); // 60 seconds for this describe block
});
```

### Playwright Timeouts

```typescript
// Per-test timeout
test('long running test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ...
});

// Global in playwright.config.ts
{
  timeout: 30000,  // Test timeout
  expect: {
    timeout: 5000, // Assertion timeout
  },
}
```

---

## CI/CD Configuration

### Turbo Configuration

```json
// turbo.json
{
  "tasks": {
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    }
  }
}
```

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
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm test
```

---

**Last Updated**: 2025-12-27
