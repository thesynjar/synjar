/**
 * E2E Test Environment Setup
 *
 * Loads environment variables for E2E tests.
 * Sets correct ports for test environment (separate from dev).
 */

// Default test environment configuration
// Note: Test ports are different from dev to avoid conflicts
// Dev: postgres 6201, mailpit 6202/6203
// Test: postgres 6211, mailpit 6212/6213
const testEnv: Record<string, string> = {
  // Database
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:6211/synjar_test?schema=public',

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

  // Backblaze B2 (mock for tests that don't need it)
  B2_KEY_ID: 'test-key',
  B2_APPLICATION_KEY: 'test-app-key',
  B2_BUCKET_NAME: 'test-bucket',
  B2_ENDPOINT: 'https://s3.us-east-005.backblazeb2.com',
};

// Set environment variables for tests
// These OVERRIDE any existing values to ensure tests use correct ports
for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] = value;
}
