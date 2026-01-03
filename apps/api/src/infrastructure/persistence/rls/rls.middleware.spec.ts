import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RlsMiddleware } from './rls.middleware';
import { UserContext } from './user.context';
import { PrismaService } from '../prisma/prisma.service';

describe('RlsMiddleware', () => {
  let middleware: RlsMiddleware;
  let userContext: UserContext;
  let prisma: PrismaService;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
  const VALID_WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440002';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RlsMiddleware,
        UserContext,
        {
          provide: PrismaService,
          useValue: {
            $executeRaw: jest.fn().mockResolvedValue(1),
            // Mock the SECURITY DEFINER function response
            $queryRaw: jest.fn().mockResolvedValue([{ check_workspace_membership: true }]),
          },
        },
      ],
    }).compile();

    middleware = module.get<RlsMiddleware>(RlsMiddleware);
    userContext = module.get<UserContext>(UserContext);
    prisma = module.get<PrismaService>(PrismaService);

    mockRequest = { params: {} };
    mockResponse = {};
    nextFunction = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('when user is not authenticated', () => {
    it('should call next() without setting any context', async () => {
      mockRequest.user = undefined;

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should not set userId when user.sub is missing', async () => {
      mockRequest.user = { email: 'test@example.com' } as any;

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(userContext.getCurrentUserIdOrNull()).toBeNull();
    });
  });

  describe('when user is authenticated without workspaceId', () => {
    beforeEach(() => {
      mockRequest.user = { sub: VALID_USER_ID, email: 'test@example.com' };
      mockRequest.params = {};
    });

    it('should set user context in database', async () => {
      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should set userId in UserContext', async () => {
      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(userContext.getCurrentUserIdOrNull()).toBe(VALID_USER_ID);
    });
  });

  describe('when user is authenticated with workspaceId', () => {
    beforeEach(() => {
      mockRequest.user = { sub: VALID_USER_ID, email: 'test@example.com' };
      mockRequest.params = { workspaceId: VALID_WORKSPACE_ID };
    });

    it('should verify membership and set workspace context', async () => {
      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(prisma.$queryRaw).toHaveBeenCalled(); // Membership check
      expect(prisma.$executeRaw).toHaveBeenCalled(); // Set context
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ check_workspace_membership: false }]);

      await expect(
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          nextFunction,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('UUID validation', () => {
    // Note: Empty string is treated as "no workspaceId" and uses user context fallback
    const INVALID_WORKSPACE_IDS = [
      'not-a-uuid',
      '550e8400-e29b-41d4-a716', // too short
      "'; DROP TABLE Document; --", // SQL injection attempt
      '../../../etc/passwd', // path traversal attempt
    ];

    beforeEach(() => {
      mockRequest.user = { sub: VALID_USER_ID, email: 'test@example.com' };
    });

    it.each(INVALID_WORKSPACE_IDS)(
      'should throw BadRequestException for invalid UUID: %s',
      async (invalidId) => {
        mockRequest.params = { workspaceId: invalidId };

        await expect(
          middleware.use(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(nextFunction).not.toHaveBeenCalled();
      },
    );

    it('should accept valid UUID format', async () => {
      mockRequest.params = { workspaceId: VALID_WORKSPACE_ID };

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('security invariants', () => {
    beforeEach(() => {
      mockRequest.user = { sub: VALID_USER_ID, email: 'test@example.com' };
      mockRequest.params = { workspaceId: VALID_WORKSPACE_ID };
    });

    it('should verify membership BEFORE setting workspace context', async () => {
      const callOrder: string[] = [];

      (prisma.$queryRaw as jest.Mock).mockImplementation(async () => {
        callOrder.push('membership_check');
        return [{ check_workspace_membership: true }];
      });

      (prisma.$executeRaw as jest.Mock).mockImplementation(async () => {
        callOrder.push('set_context');
        return 1;
      });

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(callOrder).toEqual(['membership_check', 'set_context']);
    });

    it('should NOT set context when membership verification fails', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ check_workspace_membership: false }]);

      await expect(
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          nextFunction,
        ),
      ).rejects.toThrow(ForbiddenException);

      // $executeRaw should NOT be called for setting workspace context
      // (only the membership check happens)
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });
});
