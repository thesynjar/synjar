import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { User, Workspace } from '@prisma/client';
import { WorkspaceMemberAddedEvent } from '@/application/workspace-lookup/events/workspace-member-added.event';
import { randomUUID } from 'crypto';

/**
 * Registration Orchestrator - Application Layer
 *
 * Coordinates cross-aggregate transaction (User + Workspace) during registration.
 * Handles the special case where RLS context must be set AFTER user creation
 * (chicken-and-egg problem: workspace INSERT requires user context, but user doesn't exist yet).
 *
 * This is a STRICT DDD solution:
 * - Orchestrator in Application Layer (coordinates multiple aggregates)
 * - Repository operates on single aggregate (User)
 * - RLS context managed explicitly (infrastructure concern)
 * - Domain events emitted (WorkspaceMemberAddedEvent)
 *
 * @see Architecture Review Report (2026-01-01) - Faza 2: Manual transaction
 * @see Security Review Report - CRITICAL-01: RLS context during registration
 */

export interface RegisterWithWorkspaceData {
  email: string;
  passwordHash: string;
  name?: string;
  workspaceName: string;
  ownerPermissions: string[];
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationSentAt: Date | null;
}

export interface RegisterWithWorkspaceResult {
  user: User;
  workspace: Workspace;
}

@Injectable()
export class RegistrationOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Register user with workspace in atomic transaction.
   *
   * CRITICAL IMPLEMENTATION NOTES:
   * 1. User table has NO RLS policies → can be created without context
   * 2. Workspace INSERT policy requires: "createdById" = get_current_user_id()
   * 3. We MUST set app.current_user_id AFTER creating user, BEFORE creating workspace
   * 4. All operations in SINGLE transaction for atomicity (no orphan users)
   *
   * RLS Context Flow:
   * 1. Create user (no RLS on User table - safe)
   * 2. Set RLS context: app.current_user_id = user.id
   * 3. Create workspace (RLS policy satisfied: createdById = get_current_user_id() ✅)
   * 4. Create workspace member (OWNER role)
   * 5. Emit domain events
   *
   * @param data - Registration data with user + workspace details
   * @returns Created user and workspace
   * @throws Error if transaction fails (auto-rollback, no orphan records)
   */
  async registerWithWorkspace(
    data: RegisterWithWorkspaceData,
  ): Promise<RegisterWithWorkspaceResult> {
    return this.prisma.$transaction(async (tx) => {
      // Generate user ID upfront (needed for RLS context)
      const userId = randomUUID();

      // Step 1: Create user (User table has NO RLS policies)
      const user = await tx.user.create({
        data: {
          id: userId,
          email: data.email,
          passwordHash: data.passwordHash,
          name: data.name,
          isEmailVerified: data.isEmailVerified,
          emailVerificationToken: data.emailVerificationToken,
          emailVerificationSentAt: data.emailVerificationSentAt,
        },
      });

      // Step 2: Set RLS user context now that user exists
      // This satisfies Workspace INSERT policy: "createdById" = get_current_user_id()
      // Using is_local=true ensures context is transaction-scoped (per PostgreSQL docs)
      await tx.$executeRaw`
        SELECT set_config('app.current_user_id', ${user.id}::text, true)
      `;

      // Step 3: Create workspace using raw SQL
      // WORKAROUND: Prisma Client has a bug where set_config() doesn't affect
      // subsequent Prisma operations within the same transaction for RLS policy checks.
      // Raw SQL INSERT works correctly with RLS context.
      // See: https://github.com/prisma/prisma/issues/12735
      const workspaceId = randomUUID();
      const now = new Date();
      await tx.$executeRaw`
        INSERT INTO "Workspace" (id, name, "createdById", "createdAt", "updatedAt")
        VALUES (${workspaceId}, ${data.workspaceName}, ${user.id}, ${now}, ${now})
      `;

      // Construct workspace object manually (can't fetch due to RLS)
      const workspace: Workspace = {
        id: workspaceId,
        name: data.workspaceName,
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      };

      // Step 3b: Set RLS workspace context now that workspace exists
      // This satisfies WorkspaceMember INSERT policy: "workspaceId" = get_current_workspace_id()
      await tx.$executeRaw`
        SELECT set_config('app.current_workspace_id', ${workspace.id}::text, true)
      `;

      // Step 4: Create workspace member with OWNER role using raw SQL
      // WORKAROUND: Same Prisma RLS bug as above
      const memberId = randomUUID();
      const permissionsArray = data.ownerPermissions;
      await tx.$executeRaw`
        INSERT INTO "WorkspaceMember" (id, "workspaceId", "userId", role, permissions, "createdAt")
        VALUES (${memberId}, ${workspace.id}, ${user.id}, 'OWNER', ${permissionsArray}, NOW())
      `;

      // Step 5: Emit domain event for workspace membership
      // (Same pattern as WorkspaceService.create:65-68)
      this.eventEmitter.emit(
        'workspace.member.added',
        new WorkspaceMemberAddedEvent(user.id, workspace.id),
      );

      return { user, workspace };
    });
  }
}
