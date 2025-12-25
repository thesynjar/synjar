import { UserContext } from './user.context';

describe('UserContext', () => {
  let userContext: UserContext;

  beforeEach(() => {
    userContext = new UserContext();
  });

  describe('getCurrentUserId', () => {
    it('should return userId when context is set', async () => {
      const userId = 'user-123';

      await userContext.runWithUser(userId, async () => {
        const result = userContext.getCurrentUserId();
        expect(result).toBe(userId);
      });
    });

    it('should throw error when context is not set', () => {
      expect(() => userContext.getCurrentUserId()).toThrow(
        'User context not set. Ensure RlsMiddleware is properly configured.',
      );
    });

    it('should maintain separate contexts in parallel executions', async () => {
      const userId1 = 'user-1';
      const userId2 = 'user-2';

      await Promise.all([
        userContext.runWithUser(userId1, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(userContext.getCurrentUserId()).toBe(userId1);
        }),
        userContext.runWithUser(userId2, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(userContext.getCurrentUserId()).toBe(userId2);
        }),
      ]);
    });
  });

  describe('getCurrentUserIdOrNull', () => {
    it('should return userId when context is set', async () => {
      const userId = 'user-123';

      await userContext.runWithUser(userId, async () => {
        const result = userContext.getCurrentUserIdOrNull();
        expect(result).toBe(userId);
      });
    });

    it('should return null when context is not set', () => {
      const result = userContext.getCurrentUserIdOrNull();
      expect(result).toBeNull();
    });
  });

  describe('runWithUser', () => {
    it('should execute callback with user context', async () => {
      const userId = 'user-123';
      const result = await userContext.runWithUser(userId, async () => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    it('should restore previous context after execution', async () => {
      const userId1 = 'user-1';
      const userId2 = 'user-2';

      await userContext.runWithUser(userId1, async () => {
        expect(userContext.getCurrentUserId()).toBe(userId1);

        await userContext.runWithUser(userId2, async () => {
          expect(userContext.getCurrentUserId()).toBe(userId2);
        });

        expect(userContext.getCurrentUserId()).toBe(userId1);
      });
    });

    it('should support nested contexts for background jobs', async () => {
      const userId = 'user-123';

      await userContext.runWithUser(userId, async () => {
        const innerUserId = 'background-job-user';

        await userContext.runWithUser(innerUserId, async () => {
          expect(userContext.getCurrentUserId()).toBe(innerUserId);
        });

        expect(userContext.getCurrentUserId()).toBe(userId);
      });
    });
  });

  describe('setUserId', () => {
    it('should set userId in current context', () => {
      const userId = 'user-123';

      userContext.setUserId(userId);
      expect(userContext.getCurrentUserId()).toBe(userId);
    });

    it('should override existing userId', () => {
      userContext.setUserId('user-1');
      expect(userContext.getCurrentUserId()).toBe('user-1');

      userContext.setUserId('user-2');
      expect(userContext.getCurrentUserId()).toBe('user-2');
    });
  });
});
