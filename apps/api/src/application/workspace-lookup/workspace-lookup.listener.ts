import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { WorkspaceLookupService } from './workspace-lookup.service';
import { WorkspaceMemberAddedEvent } from './events/workspace-member-added.event';
import { WorkspaceMemberRemovedEvent } from './events/workspace-member-removed.event';
import { UserEmailChangedEvent } from './events/user-email-changed.event';

@Injectable()
export class WorkspaceLookupListener {
  private readonly logger = new Logger(WorkspaceLookupListener.name);

  constructor(
    private readonly workspaceLookupService: WorkspaceLookupService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Handle workspace member added event.
   * Creates a lookup entry for the new member.
   */
  @OnEvent('workspace.member.added')
  async handleMemberAdded(event: WorkspaceMemberAddedEvent): Promise<void> {
    this.logger.log(
      `Handling workspace.member.added: userId=${event.userId}, workspaceId=${event.workspaceId}`,
    );

    try {
      // Fetch user email
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
      });

      if (!user) {
        this.logger.warn(
          `Cannot add lookup entry: User ${event.userId} not found`,
        );
        return;
      }

      await this.workspaceLookupService.addLookupEntry(
        user.email,
        event.workspaceId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add lookup entry for user ${event.userId} in workspace ${event.workspaceId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /**
   * Handle workspace member removed event.
   * Removes the lookup entry for the removed member.
   */
  @OnEvent('workspace.member.removed')
  async handleMemberRemoved(
    event: WorkspaceMemberRemovedEvent,
  ): Promise<void> {
    this.logger.log(
      `Handling workspace.member.removed: userId=${event.userId}, workspaceId=${event.workspaceId}`,
    );

    try {
      // Fetch user email
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
      });

      if (!user) {
        this.logger.warn(
          `Cannot remove lookup entry: User ${event.userId} not found`,
        );
        return;
      }

      await this.workspaceLookupService.removeLookupEntry(
        user.email,
        event.workspaceId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove lookup entry for user ${event.userId} from workspace ${event.workspaceId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /**
   * Handle user email changed event.
   * Syncs all lookup entries to the new email hash.
   */
  @OnEvent('user.email.changed')
  async handleEmailChanged(event: UserEmailChangedEvent): Promise<void> {
    this.logger.log(`Handling user.email.changed: userId=${event.userId}`);

    try {
      await this.workspaceLookupService.syncUserLookups(event.userId);
    } catch (error) {
      this.logger.error(
        `Failed to sync lookup entries for user ${event.userId} after email change`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
