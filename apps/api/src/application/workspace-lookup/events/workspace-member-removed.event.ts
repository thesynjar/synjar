import { DomainEvent } from '@/domain/shared/domain-event';

export class WorkspaceMemberRemovedEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
  ) {
    super();
  }

  get eventName(): string {
    return 'workspace.member.removed';
  }
}
