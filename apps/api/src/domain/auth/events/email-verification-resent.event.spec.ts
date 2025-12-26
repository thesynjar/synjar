import { EmailVerificationResentEvent } from './email-verification-resent.event';

describe('EmailVerificationResentEvent', () => {
  describe('toSafeLog', () => {
    it('should sanitize event for logging by removing email and token', () => {
      // Arrange
      const userId = 'user-123';
      const email = 'sensitive@example.com';
      const newVerificationToken = 'secret-token-abc123';
      const event = new EmailVerificationResentEvent(
        userId,
        email,
        newVerificationToken,
      );

      // Act
      const safeLog = event.toSafeLog();

      // Assert
      expect(safeLog).toEqual({
        eventType: 'EmailVerificationResent',
        userId: 'user-123',
      });
      expect(safeLog).not.toHaveProperty('email');
      expect(safeLog).not.toHaveProperty('newVerificationToken');
    });

    it('should not expose PII in safe log output', () => {
      // Arrange
      const event = new EmailVerificationResentEvent(
        'user-456',
        'pii@example.com',
        'token-xyz',
      );

      // Act
      const safeLog = event.toSafeLog();
      const logString = JSON.stringify(safeLog);

      // Assert
      expect(logString).not.toContain('pii@example.com');
      expect(logString).not.toContain('token-xyz');
      expect(logString).toContain('user-456');
    });
  });
});
