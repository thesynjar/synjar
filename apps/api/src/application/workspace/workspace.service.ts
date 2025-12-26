import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { Role, InvitationStatus } from '@prisma/client';
import { WorkspaceMemberAddedEvent } from '@/application/workspace-lookup/events/workspace-member-added.event';
import { WorkspaceMemberRemovedEvent } from '@/application/workspace-lookup/events/workspace-member-removed.event';
import { ConfigService } from '@nestjs/config';
import { EmailQueueService } from '@/application/email/email-queue.service';
import * as crypto from 'crypto';

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

interface InviteMemberDto {
  email: string;
  role?: Role;
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly emailQueueService: EmailQueueService,
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

  async inviteMember(
    workspaceId: string,
    userId: string,
    dto: InviteMemberDto,
  ): Promise<{ invitationToken: string }> {
    return this.prisma.forUser(userId, async (tx) => {
      // Ensure user has OWNER or ADMIN role
      const member = await this.ensureMemberTx(tx, workspaceId, userId);
      if (member.role !== Role.OWNER && member.role !== Role.ADMIN) {
        throw new ForbiddenException('Only workspace owners and admins can invite members');
      }

      // Check if workspace exists
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
      });

      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }

      // Generate invitation token (JWT-like format but stored in DB)
      const invitationToken = crypto.randomBytes(32).toString('hex');

      // Create invitation (7-day expiry)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invitation = await tx.invitation.create({
        data: {
          workspaceId,
          email: dto.email,
          role: dto.role || Role.MEMBER,
          token: invitationToken,
          status: InvitationStatus.PENDING,
          expiresAt,
          createdById: userId,
        },
      });

      // Send email if SMTP configured
      const smtpHost = this.configService.get<string>('SMTP_HOST');
      if (smtpHost) {
        const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
        const inviteUrl = `${frontendUrl}/auth/accept-invite?token=${invitationToken}`;

        // Queue invitation email in background (non-blocking) - prevents timing attacks
        this.emailQueueService.queueWorkspaceInvitation(
          dto.email,
          workspace.name,
          inviteUrl,
        );
      }

      return { invitationToken: invitation.token };
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
