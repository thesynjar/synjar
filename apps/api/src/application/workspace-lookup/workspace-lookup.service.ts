import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { hashEmail } from '@/infrastructure/crypto/hash.util';

/**
 * Service for managing user-workspace email lookups.
 * Allows users to find workspaces they have access to based on their email address.
 *
 * Security: Uses email hashing (SHA-256) to prevent email leakage.
 * RLS: This table is NOT protected by RLS - it's a public lookup mechanism.
 */
@Injectable()
export class WorkspaceLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves workspaces for a given email address.
   * Used during login to show users which workspaces they have access to.
   *
   * @param email - User's email address
   * @returns Array of workspaces (id and name only)
   *
   * @example
   * const workspaces = await workspaceLookup.resolveWorkspaces('user@example.com');
   * // Returns: [{ id: 'uuid', name: 'My Workspace' }, ...]
   */
  async resolveWorkspaces(
    email: string,
  ): Promise<{ id: string; name: string }[]> {
    const emailHash = hashEmail(email);

    const lookups = await this.prisma.userWorkspaceLookup.findMany({
      where: { emailHash },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return lookups.map((lookup) => lookup.workspace);
  }

  /**
   * Adds a lookup entry for a user's email to a workspace.
   * Called when a user is added to a workspace.
   *
   * @param email - User's email address
   * @param workspaceId - Workspace ID to associate with this email
   *
   * @example
   * await workspaceLookup.addLookupEntry('user@example.com', workspaceId);
   */
  async addLookupEntry(email: string, workspaceId: string): Promise<void> {
    const emailHash = hashEmail(email);

    // Upsert to handle race conditions and re-adding users
    await this.prisma.userWorkspaceLookup.upsert({
      where: {
        emailHash_workspaceId: {
          emailHash,
          workspaceId,
        },
      },
      create: {
        emailHash,
        workspaceId,
      },
      update: {
        // Nothing to update - entry already exists
      },
    });
  }

  /**
   * Removes a lookup entry for a user's email from a workspace.
   * Called when a user is removed from a workspace.
   *
   * @param email - User's email address
   * @param workspaceId - Workspace ID to disassociate from this email
   *
   * @example
   * await workspaceLookup.removeLookupEntry('user@example.com', workspaceId);
   */
  async removeLookupEntry(email: string, workspaceId: string): Promise<void> {
    const emailHash = hashEmail(email);

    // Delete if exists - ignore if not found (idempotent)
    await this.prisma.userWorkspaceLookup.deleteMany({
      where: {
        emailHash,
        workspaceId,
      },
    });
  }

  /**
   * Synchronizes all lookup entries for a user.
   * Ensures the lookup table matches the user's actual workspace memberships.
   *
   * Use cases:
   * - User email changed (re-hash and update all entries)
   * - Data consistency check (one-time sync or background job)
   * - Recovery after data corruption
   *
   * @param userId - User ID to sync
   *
   * @example
   * await workspaceLookup.syncUserLookups(userId);
   */
  async syncUserLookups(userId: string): Promise<void> {
    // Get user's current email and workspace memberships
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaces: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!user) {
      // User doesn't exist - nothing to sync
      return;
    }

    const emailHash = hashEmail(user.email);
    const currentWorkspaceIds = user.workspaces.map((w) => w.workspaceId);

    // Transaction to ensure consistency
    await this.prisma.$transaction(async (tx) => {
      // 1. Remove all existing entries for this email hash
      await tx.userWorkspaceLookup.deleteMany({
        where: { emailHash },
      });

      // 2. Add new entries for all current workspace memberships
      if (currentWorkspaceIds.length > 0) {
        await tx.userWorkspaceLookup.createMany({
          data: currentWorkspaceIds.map((workspaceId) => ({
            emailHash,
            workspaceId,
          })),
          skipDuplicates: true,
        });
      }
    });
  }
}
