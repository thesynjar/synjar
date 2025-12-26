/**
 * Auth Constants - Centralized Configuration
 *
 * All authentication-related magic numbers and configuration values.
 * Extracted from use cases and services to improve maintainability.
 *
 * @see H2 in docs/agents/code-quality-reviewer/reports/2025-12-26-phase4-review.md
 */

export const AuthConstants = {
  /**
   * Minimum response time for authentication operations (ms)
   * Used for timing attack prevention - ensures constant-time responses
   */
  MIN_RESPONSE_TIME_MS: 150,

  /**
   * bcrypt cost factor for password hashing
   * Determines computational complexity of password hashing
   * Range: 10-12 recommended for production
   */
  BCRYPT_COST_FACTOR: 10,

  /**
   * Grace period for unverified users to login (ms)
   * 15 minutes = 900,000 ms
   * After registration, users can login without email verification within this period
   */
  GRACE_PERIOD_MS: 15 * 60 * 1000,

  /**
   * Cooldown period between verification email resends (ms)
   * 60 seconds = 60,000 ms
   * Prevents email spam and abuse
   */
  RESEND_COOLDOWN_MS: 60 * 1000,

  /**
   * JWT Access Token expiry time
   * Format: '15m' (15 minutes)
   */
  ACCESS_TOKEN_EXPIRY: '15m',

  /**
   * JWT Refresh Token expiry time
   * Format: '7d' (7 days)
   */
  REFRESH_TOKEN_EXPIRY: '7d',
} as const;
