import { Test, TestingModule } from '@nestjs/testing';
import { RlsBypassService } from './rls-bypass.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RlsBypassService', () => {
  let service: RlsBypassService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RlsBypassService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RlsBypassService>(RlsBypassService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('withBypass', () => {
    it('should execute callback without RLS context', async () => {
      const mockExecuteRaw = jest
        .spyOn(prismaService, '$executeRaw')
        .mockResolvedValue(1);

      const mockTransaction = jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      const result = await service.withBypass(async (tx) => {
        expect(tx).toBe(prismaService);
        return { documents: [] };
      });

      expect(result).toEqual({ documents: [] });
      expect(mockTransaction).toHaveBeenCalled();

      // Verify that RLS was disabled by clearing the user context
      expect(mockExecuteRaw).toHaveBeenCalled();
      const callArgs = mockExecuteRaw.mock.calls[0];
      expect(callArgs[0]).toEqual(expect.arrayContaining([
        expect.stringContaining('set_config'),
      ]));
    });

    it('should be used for public API access', async () => {
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      // Simulate public API accessing documents via token
      const publicToken = 'public-token-abc';
      const result = await service.withBypass(async (_tx) => {
        // In real usage, this would query PublicLink first, then access documents
        // without being restricted by user's workspace membership
        return {
          token: publicToken,
          documents: [
            { id: '1', title: 'Doc 1' },
            { id: '2', title: 'Doc 2' },
          ],
        };
      });

      expect(result.documents).toHaveLength(2);
      expect(result.token).toBe(publicToken);
    });

    it('should rollback on error', async () => {
      const testError = new Error('Database error');

      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      await expect(
        service.withBypass(async (_tx) => {
          throw testError;
        }),
      ).rejects.toThrow('Database error');
    });

    it('should allow sequential bypass operations', async () => {
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(1);
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (callback: any) => {
          return callback(prismaService);
        });

      const result1 = await service.withBypass(async (_tx) => {
        return 'first-bypass';
      });

      const result2 = await service.withBypass(async (_tx) => {
        return 'second-bypass';
      });

      expect(result1).toBe('first-bypass');
      expect(result2).toBe('second-bypass');
      expect(prismaService.$transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('security considerations', () => {
    it('should only be used in PublicController and system operations', () => {
      // This is a documentation test to ensure developers understand
      // the security implications of using withBypass
      expect(service).toBeDefined();
      expect(typeof service.withBypass).toBe('function');

      // IMPORTANT: withBypass should ONLY be used in:
      // 1. PublicController for token-based access
      // 2. System background jobs that need full access
      // 3. Administrative operations with proper authorization checks

      // NEVER use withBypass in regular user-facing endpoints
    });
  });
});
