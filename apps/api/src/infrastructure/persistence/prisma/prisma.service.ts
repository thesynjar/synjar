import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { validate as isUUID } from 'uuid';
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
   * Execute callback in workspace context (RLS enabled).
   * Use for: scheduler, background jobs, system operations per-workspace.
   *
   * IMPORTANT: This method does NOT verify user membership.
   * For API requests, use RlsMiddleware which verifies membership first.
   *
   * @param workspaceId - Workspace ID to set in database session for RLS policies
   * @param callback - Async function to execute with the transaction client
   * @returns Result of the callback
   * @throws BadRequestException if workspaceId is not a valid UUID
   *
   * @example
   * // For scheduler/background jobs
   * await prisma.forWorkspace(workspaceId, async (tx) => {
   *   const documents = await tx.document.findMany({
   *     where: { processingStatus: 'PENDING' }
   *   });
   *   // Only documents from this workspace will be returned
   *   return documents;
   * });
   */
  async forWorkspace<T>(
    workspaceId: string,
    callback: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    // UUID validation (SQL injection prevention)
    if (!isUUID(workspaceId)) {
      this.logger.error({
        event: 'WORKSPACE_CONTEXT_INVALID_UUID',
        workspaceId,
        timestamp: new Date().toISOString(),
      });
      throw new BadRequestException('Invalid workspace ID format');
    }

    return this.$transaction(async (tx) => {
      // Set the workspace ID in the database session for RLS policies
      // Using set_config with is_local=true ensures the setting is transaction-scoped
      await tx.$executeRaw`SELECT set_config('app.current_workspace_id', ${workspaceId}::text, true)`;
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

  // NOTE: withoutRls() has been intentionally removed.
  // For public API token lookups, use SQL SECURITY DEFINER functions
  // like lookup_public_link_by_token() via $queryRaw.
  // See: migrations/20251229100000_add_public_link_token_lookup_function
}
