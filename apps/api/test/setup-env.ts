/**
 * E2E Test Environment Setup
 *
 * Loads environment variables for E2E tests.
 * These can be overridden by actual environment variables.
 */

// Default test environment configuration
const testEnv: Record<string, string> = {
  // Database
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:6211/synjar_test?schema=public',

  // JWT
  JWT_SECRET: 'test-jwt-secret-for-e2e-tests',
  JWT_EXPIRES_IN: '7d',

  // Email (Mailpit)
  SMTP_HOST: 'localhost',
  SMTP_PORT: '6202',
  SMTP_SECURE: 'false',
  EMAIL_VERIFICATION_URL: 'http://localhost:5173/auth/verify',
  MAILPIT_API_URL: 'http://localhost:6203',

  // OpenAI (mock for tests that don't need it)
  OPENAI_API_KEY: 'sk-test-dummy-key-for-testing',

  // Backblaze B2 (mock for tests that don't need it)
  B2_KEY_ID: 'test-key',
  B2_APPLICATION_KEY: 'test-app-key',
  B2_BUCKET_NAME: 'test-bucket',
  B2_ENDPOINT: 'https://s3.us-east-005.backblazeb2.com',
};

// Set environment variables (don't override if already set)
for (const [key, value] of Object.entries(testEnv)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
