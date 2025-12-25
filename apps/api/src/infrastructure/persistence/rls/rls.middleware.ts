import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { UserContext } from './user.context';

/**
 * JWT payload interface matching the one from jwt.strategy.ts
 */
interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * RlsMiddleware extracts the user ID from the JWT token and sets it in UserContext.
 * This enables Row Level Security (RLS) by ensuring all database queries
 * are executed with the current user's context.
 *
 * The middleware runs after authentication (JwtAuthGuard) and before
 * any business logic, ensuring the user context is available throughout
 * the request lifecycle.
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
  constructor(private readonly userContext: UserContext) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const user = req.user as JwtPayload | undefined;

    if (user?.sub) {
      // Set the user ID in AsyncLocalStorage for the duration of this request
      this.userContext.setUserId(user.sub);
    }

    next();
  }
}
