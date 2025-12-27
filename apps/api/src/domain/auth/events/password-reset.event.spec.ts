import { PasswordResetEvent } from './password-reset.event';

describe('PasswordResetEvent', () => {
  describe('toSafeLog', () => {
    it('should return safe log with eventType and userId', () => {
      // Arrange
      const userId = 'user-123';
      const event = new PasswordResetEvent(userId);

      // Act
      const safeLog = event.toSafeLog();

      // Assert
      expect(safeLog).toEqual({
        eventType: 'PasswordReset',
        userId: 'user-123',
      });
    });

    it('should include userId in safe log output', () => {
      // Arrange
      const event = new PasswordResetEvent('user-456');

      // Act
      const safeLog = event.toSafeLog();
      const logString = JSON.stringify(safeLog);

      // Assert
      expect(logString).toContain('user-456');
      expect(logString).toContain('PasswordReset');
    });
  });
});
