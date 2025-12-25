import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface UserContextStore {
  userId: string;
}

/**
 * UserContext manages the current user's ID using AsyncLocalStorage.
 * This ensures that each request maintains its own isolated user context,
 * which is used for Row Level Security (RLS) enforcement.
 *
 * @example
 * // In middleware
 * userContext.setUserId(user.sub);
 *
 * @example
 * // In background job
 * await userContext.runWithUser(userId, async () => {
 *   // All DB queries in this scope will use this userId for RLS
 *   await documentService.process();
 * });
 */
@Injectable()
export class UserContext {
  private readonly storage = new AsyncLocalStorage<UserContextStore>();

  /**
   * Gets the current user ID from AsyncLocalStorage.
   * @throws Error if user context is not set
   * @returns Current user ID
   */
  getCurrentUserId(): string {
    const store = this.storage.getStore();

    if (!store?.userId) {
      throw new Error(
        'User context not set. Ensure RlsMiddleware is properly configured.',
      );
    }

    return store.userId;
  }

  /**
   * Gets the current user ID from AsyncLocalStorage, or null if not set.
   * Useful for optional authentication scenarios.
   *
   * @returns Current user ID or null
   */
  getCurrentUserIdOrNull(): string | null {
    const store = this.storage.getStore();
    return store?.userId ?? null;
  }

  /**
   * Sets the user ID in the current AsyncLocalStorage context.
   * This should be called by RlsMiddleware after JWT authentication.
   *
   * @param userId - User ID to set in context
   */
  setUserId(userId: string): void {
    const store = this.storage.getStore();
    if (!store) {
      // Create a new store if one doesn't exist
      // This is needed for the middleware usage pattern
      this.storage.enterWith({ userId });
    } else {
      store.userId = userId;
    }
  }

  /**
   * Executes a callback with a specific user context.
   * This is useful for background jobs or system operations that need
   * to execute queries on behalf of a specific user.
   *
   * @param userId - User ID to set for the duration of the callback
   * @param callback - Async function to execute with the user context
   * @returns Result of the callback
   *
   * @example
   * await userContext.runWithUser('user-123', async () => {
   *   // All queries here will use user-123 for RLS
   *   await processDocument(docId);
   * });
   */
  async runWithUser<T>(
    userId: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.storage.run({ userId }, callback);
  }
}
