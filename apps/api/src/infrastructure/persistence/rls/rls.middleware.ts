import {
  Injectable,
  NestMiddleware,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { validate as isUUID } from 'uuid';
import { UserContext } from './user.context';
import { PrismaService } from '../prisma/prisma.service';

/**
 * JWT payload interface matching the one from jwt.strategy.ts
 */
interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * RlsMiddleware sets the database context for Row Level Security (RLS).
 *
 * Flow:
 * 1. Extract workspaceId from URL (if present)
 * 2. If workspaceId:
 *    - Validate UUID format (SQL injection prevention)
 *    - Verify user membership BEFORE setting context (CRITICAL)
 *    - Set workspace context (app.current_workspace_id)
 * 3. If no workspaceId:
 *    - Set user context (app.current_user_id) for list endpoints
 *
 * SECURITY INVARIANTS:
 * - NEVER set workspace context without verifying membership first
 * - ALWAYS validate UUID format before any database operation
 *
 * @example
 * // Register in AppModule
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(RlsMiddleware).forRoutes('*');
 *   }
 * }
 */
@Injectable()
export class RlsMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RlsMiddleware.name);

  constructor(
    private readonly userContext: UserContext,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const user = req.user as JwtPayload | undefined;

    // No authenticated user - skip RLS setup (public endpoints)
    if (!user?.sub) {
      return next();
    }

    // Always set user context in AsyncLocalStorage
    this.userContext.setUserId(user.sub);

    // Extract workspaceId from URL params
    const workspaceId = req.params.workspaceId;

    // Endpoints without workspace context (e.g., GET /workspaces)
    if (!workspaceId) {
      // Set user context for RLS policies that support user fallback
      await this.setUserContext(user.sub);
      return next();
    }

    // UUID validation (SQL injection prevention)
    if (!isUUID(workspaceId)) {
      this.logger.warn({
        event: 'INVALID_WORKSPACE_ID',
        workspaceId,
        userId: user.sub,
        path: req.path,
      });
      throw new BadRequestException('Invalid workspace ID format');
    }

    // CRITICAL: Verify membership BEFORE setting context
    const isMember = await this.verifyMembership(user.sub, workspaceId);
    if (!isMember) {
      this.logger.warn({
        event: 'WORKSPACE_ACCESS_DENIED',
        workspaceId,
        userId: user.sub,
        path: req.path,
      });
      throw new ForbiddenException('Not a member of this workspace');
    }

    // SAFE: User verified as member, set workspace context
    await this.setWorkspaceContext(workspaceId);

    next();
  }

  /**
   * Set user context in database session.
   * Used for endpoints without workspaceId (list endpoints).
   */
  private async setUserContext(userId: string): Promise<void> {
    await this.prisma.$executeRaw`
      SELECT set_config('app.current_user_id', ${userId}::text, true)
    `;
  }

  /**
   * Set workspace context in database session.
   * ONLY call after verifying membership!
   */
  private async setWorkspaceContext(workspaceId: string): Promise<void> {
    await this.prisma.$executeRaw`
      SELECT set_config('app.current_workspace_id', ${workspaceId}::text, true)
    `;
  }

  /**
   * Verify user is a member of the workspace.
   * Uses SECURITY DEFINER function to bypass RLS.
   *
   * Why SECURITY DEFINER?
   * The raw query would be subject to RLS policies which require context.
   * But we're verifying membership BEFORE we can set context (chicken-and-egg).
   * The SECURITY DEFINER function runs as the function owner, bypassing RLS.
   */
  private async verifyMembership(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const result = await this.prisma.$queryRaw<{ check_workspace_membership: boolean }[]>`
      SELECT check_workspace_membership(${userId}::text, ${workspaceId}::text)
    `;

    return result[0]?.check_workspace_membership === true;
  }
}
