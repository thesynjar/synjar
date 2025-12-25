import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

/**
 * Type for Prisma transaction client
 */
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * RlsBypassService provides a way to bypass Row Level Security for specific use cases.
 *
 * SECURITY WARNING: This service should ONLY be used in:
 * 1. Public API endpoints (PublicController) with token-based authorization
 * 2. System background jobs that require full access
 * 3. Administrative operations with proper authorization checks
 *
 * NEVER use this service in regular user-facing endpoints as it bypasses
 * workspace isolation security.
 *
 * @example
 * // In PublicController for token-based access
 * async searchPublic(token: string, query: string) {
 *   return this.rlsBypass.withBypass(async (tx) => {
 *     // Verify token first
 *     const publicLink = await tx.publicLink.findUnique({
 *       where: { token }
 *     });
 *
 *     if (!publicLink) throw new UnauthorizedException();
 *
 *     // Access documents without RLS restrictions
 *     return tx.document.findMany({
 *       where: { workspaceId: publicLink.workspaceId }
 *     });
 *   });
 * }
 */
@Injectable()
export class RlsBypassService {
  private readonly logger = new Logger(RlsBypassService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executes a callback without Row Level Security restrictions.
   * This clears the user context, allowing full database access.
   *
   * @param callback - Async function to execute without RLS
   * @returns Result of the callback
   *
   * @example
   * await rlsBypass.withBypass(async (tx) => {
   *   // This query will not be filtered by RLS policies
   *   return tx.document.findMany();
   * });
   */
  async withBypass<T>(
    callback: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    // SECURITY AUDIT: Log all RLS bypass operations
    const stackTrace = new Error().stack;
    this.logger.warn({
      event: 'RLS_BYPASS',
      message: 'withBypass() called - bypassing Row Level Security',
      timestamp: new Date().toISOString(),
      stackTrace,
    });

    return this.prisma.$transaction(async (tx) => {
      // Set SYSTEM context to bypass RLS (returns all workspaces)
      // SYSTEM is recognized by RLS policies as a bypass mechanism
      await tx.$executeRaw`SELECT set_config('app.current_user_id', 'SYSTEM', true)`;
      return callback(tx);
    });
  }
}
