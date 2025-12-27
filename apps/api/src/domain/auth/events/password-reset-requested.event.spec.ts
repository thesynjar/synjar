import { PasswordResetRequestedEvent } from './password-reset-requested.event';

describe('PasswordResetRequestedEvent', () => {
  describe('toSafeLog', () => {
    it('should sanitize event for logging by removing email', () => {
      // Arrange
      const userId = 'user-123';
      const email = 'sensitive@example.com';
      const event = new PasswordResetRequestedEvent(userId, email);

      // Act
      const safeLog = event.toSafeLog();

      // Assert
      expect(safeLog).toEqual({
        eventType: 'PasswordResetRequested',
        userId: 'user-123',
      });
      expect(safeLog).not.toHaveProperty('email');
    });

    it('should not expose PII in safe log output', () => {
      // Arrange
      const event = new PasswordResetRequestedEvent(
        'user-456',
        'pii@example.com',
      );

      // Act
      const safeLog = event.toSafeLog();
      const logString = JSON.stringify(safeLog);

      // Assert
      expect(logString).not.toContain('pii@example.com');
      expect(logString).toContain('user-456');
    });
  });
});
