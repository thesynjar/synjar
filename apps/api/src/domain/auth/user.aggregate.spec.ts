/**
 * User Aggregate Tests - Password Reset Functionality
 *
 * Tests aggregate behavior for password reset feature:
 * - canRequestPasswordReset: Cooldown period enforcement
 * - requestPasswordReset: Token generation and event emission
 * - resetPassword: Token clearing and event emission
 *
 * @see docs/specifications/2025-12-27-password-reset.md
 */

import { UserAggregate } from './user.aggregate';
import { PasswordResetRequestedEvent } from './events/password-reset-requested.event';
import { PasswordResetEvent } from './events/password-reset.event';
import { AuthConstants } from '@/infrastructure/config/constants';

describe('UserAggregate', () => {
  // Test helper to create a reconstituted user with specific state
  function createTestUser(overrides: Partial<{
    id: string;
    email: string;
    passwordHash: string;
    isEmailVerified: boolean;
    emailVerificationToken: string | null;
    emailVerificationSentAt: Date | null;
    createdAt: Date;
    passwordResetToken: string | null;
    passwordResetSentAt: Date | null;
  }> = {}): UserAggregate {
    return UserAggregate.reconstitute({
      id: overrides.id ?? 'test-user-id',
      email: overrides.email ?? 'test@example.com',
      passwordHash: overrides.passwordHash ?? 'hashed-password',
      isEmailVerified: overrides.isEmailVerified ?? true,
      emailVerificationToken: overrides.emailVerificationToken ?? null,
      emailVerificationSentAt: overrides.emailVerificationSentAt ?? null,
      createdAt: overrides.createdAt ?? new Date(),
      passwordResetToken: overrides.passwordResetToken ?? null,
      passwordResetSentAt: overrides.passwordResetSentAt ?? null,
    });
  }

  describe('canRequestPasswordReset', () => {
    it('should allow reset when no previous request', () => {
      // Arrange
      const user = createTestUser({
        passwordResetToken: null,
        passwordResetSentAt: null,
      });

      // Act
      const result = user.canRequestPasswordReset();

      // Assert
      expect(result.can).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block request within 60s cooldown', () => {
      // Arrange - request was sent 30 seconds ago (within cooldown)
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      const user = createTestUser({
        passwordResetToken: 'a'.repeat(64),
        passwordResetSentAt: thirtySecondsAgo,
      });

      // Act
      const result = user.canRequestPasswordReset();

      // Assert
      expect(result.can).toBe(false);
      expect(result.reason).toBe('Please wait before requesting another password reset');
    });

    it('should allow request after 60s cooldown', () => {
      // Arrange - request was sent 61 seconds ago (after cooldown)
      const sixtyOneSecondsAgo = new Date(Date.now() - AuthConstants.PASSWORD_RESET_COOLDOWN_MS - 1000);
      const user = createTestUser({
        passwordResetToken: 'a'.repeat(64),
        passwordResetSentAt: sixtyOneSecondsAgo,
      });

      // Act
      const result = user.canRequestPasswordReset();

      // Assert
      expect(result.can).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow request exactly at cooldown boundary', () => {
      // Arrange - request was sent exactly 60 seconds ago
      const exactlySixtySecondsAgo = new Date(Date.now() - AuthConstants.PASSWORD_RESET_COOLDOWN_MS);
      const user = createTestUser({
        passwordResetToken: 'a'.repeat(64),
        passwordResetSentAt: exactlySixtySecondsAgo,
      });

      // Act
      const result = user.canRequestPasswordReset();

      // Assert
      expect(result.can).toBe(true);
    });
  });

  describe('requestPasswordReset', () => {
    it('should generate new token and emit PasswordResetRequestedEvent', () => {
      // Arrange
      const user = createTestUser({
        id: 'user-123',
        email: 'test@example.com',
        passwordResetToken: null,
        passwordResetSentAt: null,
      });

      // Act
      const token = user.requestPasswordReset();

      // Assert - Token generated
      expect(token).toBeDefined();
      expect(token.getValue()).toHaveLength(64);
      expect(user.getPasswordResetToken()).toBe(token.getValue());
      expect(user.getPasswordResetSentAt()).toBeInstanceOf(Date);

      // Assert - Event emitted
      const events = user.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PasswordResetRequestedEvent);

      const event = events[0] as PasswordResetRequestedEvent;
      expect(event.userId).toBe('user-123');
      expect(event.email).toBe('test@example.com');
    });

    it('should throw error if within cooldown', () => {
      // Arrange - request was sent 10 seconds ago
      const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
      const user = createTestUser({
        passwordResetToken: 'a'.repeat(64),
        passwordResetSentAt: tenSecondsAgo,
      });

      // Act & Assert
      expect(() => user.requestPasswordReset()).toThrow(
        'Please wait before requesting another password reset',
      );

      // No events should be emitted on error
      expect(user.getDomainEvents()).toHaveLength(0);
    });

    it('should replace existing token when cooldown elapsed', () => {
      // Arrange - old request was sent 2 minutes ago
      const twoMinutesAgo = new Date(Date.now() - 120 * 1000);
      const oldToken = 'b'.repeat(64);
      const user = createTestUser({
        passwordResetToken: oldToken,
        passwordResetSentAt: twoMinutesAgo,
      });

      // Act
      const newToken = user.requestPasswordReset();

      // Assert
      expect(newToken.getValue()).not.toBe(oldToken);
      expect(user.getPasswordResetToken()).toBe(newToken.getValue());
    });
  });

  describe('resetPassword', () => {
    it('should clear token and emit PasswordResetEvent', () => {
      // Arrange
      const user = createTestUser({
        id: 'user-456',
        passwordResetToken: 'c'.repeat(64),
        passwordResetSentAt: new Date(),
      });

      // Act
      user.resetPassword();

      // Assert - Token cleared
      expect(user.getPasswordResetToken()).toBeNull();
      expect(user.getPasswordResetSentAt()).toBeNull();

      // Assert - Event emitted
      const events = user.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PasswordResetEvent);

      const event = events[0] as PasswordResetEvent;
      expect(event.userId).toBe('user-456');
    });

    it('should work even when no token was set', () => {
      // Arrange
      const user = createTestUser({
        id: 'user-789',
        passwordResetToken: null,
        passwordResetSentAt: null,
      });

      // Act
      user.resetPassword();

      // Assert
      expect(user.getPasswordResetToken()).toBeNull();
      expect(user.getPasswordResetSentAt()).toBeNull();

      const events = user.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PasswordResetEvent);
    });
  });
});
