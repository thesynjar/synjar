import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { RlsMiddleware } from './rls.middleware';
import { UserContext } from './user.context';

describe('RlsMiddleware', () => {
  let middleware: RlsMiddleware;
  let userContext: UserContext;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RlsMiddleware, UserContext],
    }).compile();

    middleware = module.get<RlsMiddleware>(RlsMiddleware);
    userContext = module.get<UserContext>(UserContext);

    mockRequest = {};
    mockResponse = {};
    nextFunction = jest.fn();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('when user is authenticated', () => {
    it('should set userId in UserContext from JWT payload', async () => {
      const userId = 'user-123';
      mockRequest.user = { sub: userId, email: 'test@example.com' };

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(nextFunction).toHaveBeenCalled();
      // Verify context is set by checking it can be retrieved
      const contextUserId = userContext.getCurrentUserIdOrNull();
      expect(contextUserId).toBe(userId);
    });

    it('should handle different user IDs correctly', async () => {
      const userId1 = 'user-abc';
      mockRequest.user = { sub: userId1, email: 'user1@example.com' };

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(userContext.getCurrentUserIdOrNull()).toBe(userId1);

      // Simulate a new request with different user
      const userId2 = 'user-xyz';
      mockRequest.user = { sub: userId2, email: 'user2@example.com' };

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(userContext.getCurrentUserIdOrNull()).toBe(userId2);
    });
  });

  describe('when user is not authenticated', () => {
    it('should not set userId when user is undefined', async () => {
      mockRequest.user = undefined;

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(userContext.getCurrentUserIdOrNull()).toBeNull();
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

  describe('next function', () => {
    it('should always call next() regardless of authentication', async () => {
      mockRequest.user = undefined;

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(nextFunction).toHaveBeenCalledTimes(1);
    });

    it('should call next() even when userId is set', async () => {
      mockRequest.user = { sub: 'user-123', email: 'test@example.com' };

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
  });
});
