/**
 * Jest Global Setup for E2E Tests
 *
 * This runs BEFORE any test files are loaded, ensuring environment
 * variables are set before module compilation.
 */

export default async function globalSetup() {
  // Set NODE_ENV first so ConfigModule knows to ignore .env
  process.env.NODE_ENV = 'test';

  // Test environment configuration
  // Test ports are different from dev to avoid conflicts
  // Dev: postgres 6201, mailpit 6202/6203
  // Test: postgres 6211, mailpit 6212/6213
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:6211/synjar_test?schema=public';
  process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-tests';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '6212';
  process.env.SMTP_SECURE = 'false';
  process.env.EMAIL_VERIFICATION_URL = 'http://localhost:6210/auth/verify';
  process.env.MAILPIT_API_URL = 'http://localhost:6213';
  process.env.OPENAI_API_KEY = 'sk-test-dummy-key-for-testing';
  process.env.B2_KEY_ID = 'test-key';
  process.env.B2_APPLICATION_KEY = 'test-app-key';
  process.env.B2_BUCKET_NAME = 'test-bucket';
  process.env.B2_ENDPOINT = 'https://s3.us-east-005.backblazeb2.com';
}
