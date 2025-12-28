import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UserContext } from '../rls/user.context';

describe('PrismaService RLS Extensions', () => {
  let prismaService: PrismaService;
  let userContext: UserContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, UserContext],
    }).compile();

    prismaService = module.get<PrismaService>(PrismaService);
    userContext = module.get<UserContext>(UserContext);

    // Mock the database connection methods
    jest.spyOn(prismaService, '$connect').mockResolvedValue(undefined);
    jest.spyOn(prismaService, '$disconnect').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('forUser', () => {
    it('should execute callback with userId set in database session', async () => {
      const userId = 'user-123';
      const mockExecuteRaw = jest
        .spyOn(prismaService, '$executeRaw')
        .mockResolvedValue(1);

      const mockTransaction = jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      const result = await prismaService.forUser(userId, async (tx) => {
        // Verify we received the transaction client
        expect(tx).toBe(prismaService);
        return 'test-result';
      });

      expect(result).toBe('test-result');
      expect(mockTransaction).toHaveBeenCalled();

      // Verify the SQL was called with the correct structure
      expect(mockExecuteRaw).toHaveBeenCalled();
      const callArgs = mockExecuteRaw.mock.calls[0];
      expect(callArgs[0]).toEqual(expect.arrayContaining([
        expect.stringContaining('set_config'),
      ]));
    });

    it('should support nested transactions with different users', async () => {
      const userId1 = 'user-1';
      const userId2 = 'user-2';
      const executionOrder: string[] = [];

      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);

      // Mock transaction to actually execute the callback
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      await prismaService.forUser(userId1, async () => {
        executionOrder.push('user1-start');

        await prismaService.forUser(userId2, async () => {
          executionOrder.push('user2-nested');
        });

        executionOrder.push('user1-end');
      });

      expect(executionOrder).toEqual([
        'user1-start',
        'user2-nested',
        'user1-end',
      ]);
    });

    it('should rollback on error', async () => {
      const userId = 'user-123';
      const testError = new Error('Test error');

      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      await expect(
        prismaService.forUser(userId, async () => {
          throw testError;
        }),
      ).rejects.toThrow('Test error');
    });
  });

  describe('withCurrentUser', () => {
    it('should execute callback with userId from UserContext', async () => {
      const userId = 'user-from-context';

      // Mock UserContext to return a userId
      jest.spyOn(userContext, 'getCurrentUserId').mockReturnValue(userId);

      const mockExecuteRaw = jest
        .spyOn(prismaService, '$executeRaw')
        .mockResolvedValue(1);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      const result = await prismaService.withCurrentUser(async (tx) => {
        expect(tx).toBe(prismaService);
        return 'context-result';
      });

      expect(result).toBe('context-result');
      expect(mockExecuteRaw).toHaveBeenCalled();
      const callArgs = mockExecuteRaw.mock.calls[0];
      expect(callArgs[0]).toEqual(expect.arrayContaining([
        expect.stringContaining('set_config'),
      ]));
    });

    it('should throw error when UserContext is not set', async () => {
      // Mock UserContext to throw error (no user in context)
      jest.spyOn(userContext, 'getCurrentUserId').mockImplementation(() => {
        throw new Error(
          'User context not set. Ensure RlsMiddleware is properly configured.',
        );
      });

      await expect(
        prismaService.withCurrentUser(async () => {
          return 'should-not-execute';
        }),
      ).rejects.toThrow('User context not set');
    });

    it('should work in middleware request flow', async () => {
      const userId = 'request-user';

      // Simulate middleware setting the user context
      jest.spyOn(userContext, 'getCurrentUserId').mockReturnValue(userId);

      const mockExecuteRaw = jest
        .spyOn(prismaService, '$executeRaw')
        .mockResolvedValue(1);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      const result = await prismaService.withCurrentUser(async () => {
        // This simulates a service method that needs RLS
        return { data: 'user-specific-data' };
      });

      expect(result).toEqual({ data: 'user-specific-data' });
      expect(mockExecuteRaw).toHaveBeenCalled();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle forUser for background jobs independently of UserContext', async () => {
      // UserContext is not set (no HTTP request)
      jest.spyOn(userContext, 'getCurrentUserIdOrNull').mockReturnValue(null);

      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      // Background job can still use forUser
      const result = await prismaService.forUser('background-job-user', async () => {
        return 'job-completed';
      });

      expect(result).toBe('job-completed');
    });

    it('should allow mixing forUser and withCurrentUser', async () => {
      const contextUserId = 'context-user';
      const explicitUserId = 'explicit-user';

      jest.spyOn(userContext, 'getCurrentUserId').mockReturnValue(contextUserId);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      // Use current user from context
      await prismaService.withCurrentUser(async () => {
        // Then explicitly use a different user
        await prismaService.forUser(explicitUserId, async () => {
          // Both should work
        });
      });

      expect(prismaService.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('forWorkspace', () => {
    const VALID_WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
    const INVALID_WORKSPACE_IDS = [
      'not-a-uuid',
      '550e8400-e29b-41d4-a716', // too short
      '550e8400-e29b-41d4-a716-446655440000-extra', // too long
      "'; DROP TABLE Document; --", // SQL injection attempt
      '',
      'null',
      '../../../etc/passwd', // path traversal attempt
    ];

    it('should execute callback with workspaceId set in database session', async () => {
      const mockExecuteRaw = jest
        .spyOn(prismaService, '$executeRaw')
        .mockResolvedValue(1);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      const result = await prismaService.forWorkspace(VALID_WORKSPACE_ID, async (tx) => {
        expect(tx).toBe(prismaService);
        return 'workspace-result';
      });

      expect(result).toBe('workspace-result');
      expect(mockExecuteRaw).toHaveBeenCalled();
      const callArgs = mockExecuteRaw.mock.calls[0];
      expect(callArgs[0]).toEqual(expect.arrayContaining([
        expect.stringContaining('set_config'),
      ]));
    });

    it('should throw BadRequestException for invalid UUID formats', async () => {
      for (const invalidId of INVALID_WORKSPACE_IDS) {
        await expect(
          prismaService.forWorkspace(invalidId, async () => 'should-not-execute'),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('should not execute callback when UUID validation fails', async () => {
      const mockTransaction = jest.spyOn(prismaService, '$transaction');
      const callback = jest.fn();

      await expect(
        prismaService.forWorkspace('invalid-uuid', callback),
      ).rejects.toThrow(BadRequestException);

      expect(mockTransaction).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const testError = new Error('Test error');

      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      await expect(
        prismaService.forWorkspace(VALID_WORKSPACE_ID, async () => {
          throw testError;
        }),
      ).rejects.toThrow('Test error');
    });

    it('should work for scheduler/background jobs', async () => {
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      // Scheduler processes per workspace without user context
      const result = await prismaService.forWorkspace(VALID_WORKSPACE_ID, async () => {
        return { processed: 5 };
      });

      expect(result).toEqual({ processed: 5 });
    });

    it('should support mixing forWorkspace and forUser', async () => {
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      // First use workspace context
      await prismaService.forWorkspace(VALID_WORKSPACE_ID, async () => {
        // Then use user context
        await prismaService.forUser('user-123', async () => {
          // Both should work (e.g., for audit purposes)
        });
      });

      expect(prismaService.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });
});
