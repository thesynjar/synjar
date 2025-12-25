import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { UserContext } from '../rls/user.context';

/**
 * Type for Prisma transaction client
 */
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly userContext: UserContext) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Executes a callback within a transaction with RLS context set for a specific user.
   * This is the primary method for enforcing Row Level Security.
   *
   * @param userId - User ID to set in database session for RLS policies
   * @param callback - Async function to execute with the transaction client
   * @returns Result of the callback
   *
   * @example
   * // For background jobs or system operations
   * await prisma.forUser(userId, async (tx) => {
   *   const documents = await tx.document.findMany({
   *     where: { workspaceId }
   *   });
   *   // Only documents from user's workspaces will be returned
   *   return documents;
   * });
   */
  async forUser<T>(
    userId: string,
    callback: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      // Set the user ID in the database session for RLS policies
      // Using set_config with is_local=true ensures the setting is transaction-scoped
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}::text, true)`;
      return callback(tx);
    });
  }

  /**
   * Executes a callback within a transaction using the current user from UserContext.
   * This should be used in HTTP request handlers where RlsMiddleware has set the user context.
   *
   * @param callback - Async function to execute with the transaction client
   * @returns Result of the callback
   * @throws Error if UserContext is not set (e.g., middleware not configured)
   *
   * @example
   * // In a service method called from a controller
   * async getDocuments(workspaceId: string) {
   *   return this.prisma.withCurrentUser(async (tx) => {
   *     return tx.document.findMany({
   *       where: { workspaceId }
   *     });
   *     // RLS will automatically filter by user's workspace membership
   *   });
   * }
   */
  async withCurrentUser<T>(
    callback: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    const userId = this.userContext.getCurrentUserId();
    return this.forUser(userId, callback);
  }

  /**
   * DANGEROUS: Executes a callback without Row Level Security restrictions.
   * This bypasses all RLS policies by clearing the user context.
   *
   * USE WITH EXTREME CAUTION - Only for:
   * - Public API endpoints (with proper token validation)
   * - System operations
   * - Administrative tasks
   *
   * @param callback - Async function to execute with the transaction client
   * @returns Result of the callback
   *
   * @example
   * // Public API endpoint with token validation
   * async searchPublic(token: string, query: string) {
   *   // First validate the token
   *   const publicLink = await this.validatePublicLinkToken(token);
   *
   *   // Then bypass RLS for public access
   *   return this.prisma.withoutRls(async (tx) => {
   *     return tx.document.findMany({
   *       where: {
   *         workspaceId: publicLink.workspaceId,
   *         // Additional filters based on public link configuration
   *       }
   *     });
   *   });
   * }
   */
  async withoutRls<T>(
    callback: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    // SECURITY AUDIT: Log all RLS bypass operations
    const stackTrace = new Error().stack;
    this.logger.warn({
      event: 'RLS_BYPASS',
      message: 'withoutRls() called - bypassing Row Level Security',
      timestamp: new Date().toISOString(),
      stackTrace,
    });

    return this.$transaction(async (tx) => {
      // Set SYSTEM context to bypass RLS (returns all workspaces)
      await tx.$executeRaw`SELECT set_config('app.current_user_id', 'SYSTEM', true)`;
      return callback(tx);
    });
  }
}
