/**
 * E2E Test Environment Setup
 *
 * Loads environment variables for E2E tests.
 * Sets correct ports for test environment (separate from dev).
 */

// Default test environment configuration
// Note: Test ports are different from dev to avoid conflicts
// Dev: postgres 6205
// Test: postgres 6311, mailpit 6312/6313, minio 6314/6315
const testEnv: Record<string, string> = {
  // Database
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public',

  // JWT
  JWT_SECRET: 'test-jwt-secret-for-e2e-tests',
  JWT_EXPIRES_IN: '7d',

  // Email (Mailpit - test ports)
  SMTP_HOST: 'localhost',
  SMTP_PORT: '6212',
  SMTP_SECURE: 'false',
  EMAIL_VERIFICATION_URL: 'http://localhost:6210/auth/verify',
  MAILPIT_API_URL: 'http://localhost:6213',

  // OpenAI (mock for tests that don't need it)
  OPENAI_API_KEY: 'sk-test-dummy-key-for-testing',

  // MinIO S3-compatible storage (replaces Backblaze B2 in tests)
  // Uses same ports as docker-compose.test.yml
  B2_KEY_ID: 'minioadmin',
  B2_APPLICATION_KEY: 'minioadmin',
  B2_BUCKET_NAME: 'synjar-test',
  B2_ENDPOINT: 'http://localhost:6214',
};

const isCi = process.env.CI === 'true';

// Set environment variables for tests.
// In CI, respect values provided by the pipeline and only fill missing ones.
for (const [key, value] of Object.entries(testEnv)) {
  if (isCi && process.env[key]) {
    continue;
  }

  process.env[key] = value;
}
