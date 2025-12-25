import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { Role } from '@prisma/client';
import { WorkspaceMemberAddedEvent } from '@/application/workspace-lookup/events/workspace-member-added.event';
import { WorkspaceMemberRemovedEvent } from '@/application/workspace-lookup/events/workspace-member-removed.event';

interface CreateWorkspaceDto {
  name: string;
}

interface UpdateWorkspaceDto {
  name?: string;
}

interface AddMemberDto {
  userId: string;
  role?: Role;
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    // Use forUser() to set RLS context - createdById enables visibility for RETURNING
    const workspace = await this.prisma.forUser(userId, async (tx) => {
      return tx.workspace.create({
        data: {
          name: dto.name,
          createdById: userId,
          members: {
            create: {
              userId,
              role: Role.OWNER,
            },
          },
        },
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
        },
      });
    });

    // Emit event for workspace owner membership
    this.eventEmitter.emit(
      'workspace.member.added',
      new WorkspaceMemberAddedEvent(userId, workspace.id),
    );

    return workspace;
  }

  async findAllForUser(userId: string) {
    // Use forUser() for RLS context
    return this.prisma.forUser(userId, async (tx) => {
      return tx.workspace.findMany({
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
          _count: {
            select: { documents: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async findOne(workspaceId: string, userId: string) {
    return this.prisma.forUser(userId, async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
          _count: {
            select: { documents: true, publicLinks: true },
          },
        },
      });

      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }

      return workspace;
    });
  }

  async update(workspaceId: string, userId: string, dto: UpdateWorkspaceDto) {
    return this.prisma.forUser(userId, async (tx) => {
      await this.ensureOwnerTx(tx, workspaceId, userId);

      return tx.workspace.update({
        where: { id: workspaceId },
        data: dto,
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
        },
      });
    });
  }

  async delete(workspaceId: string, userId: string) {
    return this.prisma.forUser(userId, async (tx) => {
      await this.ensureOwnerTx(tx, workspaceId, userId);

      await tx.workspace.delete({
        where: { id: workspaceId },
      });
    });
  }

  async addMember(workspaceId: string, ownerId: string, dto: AddMemberDto) {
    return this.prisma.forUser(ownerId, async (tx) => {
      await this.ensureOwnerTx(tx, workspaceId, ownerId);

      const user = await tx.user.findUnique({
        where: { id: dto.userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const member = await tx.workspaceMember.create({
        data: {
          workspaceId,
          userId: dto.userId,
          role: dto.role || Role.MEMBER,
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      // Emit event for new workspace member
      this.eventEmitter.emit(
        'workspace.member.added',
        new WorkspaceMemberAddedEvent(dto.userId, workspaceId),
      );

      return member;
    });
  }

  async getMembers(workspaceId: string, userId: string) {
    return this.prisma.forUser(userId, async (tx) => {
      await this.ensureMemberTx(tx, workspaceId, userId);

      return tx.workspaceMember.findMany({
        where: { workspaceId },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
    });
  }

  async removeMember(
    workspaceId: string,
    ownerId: string,
    memberUserId: string,
  ) {
    return this.prisma.forUser(ownerId, async (tx) => {
      await this.ensureOwnerTx(tx, workspaceId, ownerId);

      if (ownerId === memberUserId) {
        throw new ForbiddenException('Cannot remove yourself as owner');
      }

      await tx.workspaceMember.deleteMany({
        where: {
          workspaceId,
          userId: memberUserId,
        },
      });

      // Emit event for removed workspace member
      this.eventEmitter.emit(
        'workspace.member.removed',
        new WorkspaceMemberRemovedEvent(memberUserId, workspaceId),
      );
    });
  }

  async ensureMember(workspaceId: string, userId: string) {
    return this.prisma.forUser(userId, async (tx) => {
      const member = await tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId, userId },
        },
      });

      if (!member) {
        throw new ForbiddenException('Not a member of this workspace');
      }

      return member;
    });
  }

  async ensureOwner(workspaceId: string, userId: string) {
    return this.prisma.forUser(userId, async (tx) => {
      const member = await this.ensureMemberTx(tx, workspaceId, userId);

      if (member.role !== Role.OWNER) {
        throw new ForbiddenException('Only owner can perform this action');
      }

      return member;
    });
  }

  // Transaction-aware version of ensureMember
  private async ensureMemberTx(
    tx: Parameters<Parameters<typeof this.prisma.forUser>[1]>[0],
    workspaceId: string,
    userId: string,
  ) {
    const member = await tx.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });

    if (!member) {
      throw new ForbiddenException('Not a member of this workspace');
    }

    return member;
  }

  // Transaction-aware version of ensureOwner
  private async ensureOwnerTx(
    tx: Parameters<Parameters<typeof this.prisma.forUser>[1]>[0],
    workspaceId: string,
    userId: string,
  ) {
    const member = await this.ensureMemberTx(tx, workspaceId, userId);

    if (member.role !== Role.OWNER) {
      throw new ForbiddenException('Only owner can perform this action');
    }

    return member;
  }
}
