import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserContext } from '../rls/user.context';
import {
  IWorkspaceRepository,
  WorkspaceWithMembers,
  CreateWorkspaceData,
} from '../../../domain/workspace/workspace.repository';

@Injectable()
export class PrismaWorkspaceRepository implements IWorkspaceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContext,
  ) {}

  async findById(id: string): Promise<WorkspaceWithMembers | null> {
    const userId = this.userContext.getCurrentUserId();
    if (!userId) throw new UnauthorizedException();

    return this.prisma.forUser(userId, async (tx) => {
      return tx.workspace.findUnique({
        where: { id },
        include: { members: { include: { user: true } } },
      });
    });
  }

  async findByUserId(userId: string): Promise<WorkspaceWithMembers[]> {
    return this.prisma.forUser(userId, async (tx) => {
      return tx.workspace.findMany({
        where: { members: { some: { userId } } },
        include: { members: { include: { user: true } } },
      });
    });
  }

  async create(data: CreateWorkspaceData): Promise<WorkspaceWithMembers> {
    return this.prisma.forUser(data.ownerId, async (tx) => {
      return tx.workspace.create({
        data: {
          name: data.name,
          createdById: data.ownerId,
          members: {
            create: { userId: data.ownerId, role: 'OWNER' },
          },
        },
        include: { members: { include: { user: true } } },
      });
    });
  }

  async update(id: string, data: { name: string }): Promise<WorkspaceWithMembers> {
    const userId = this.userContext.getCurrentUserId();
    if (!userId) throw new UnauthorizedException();

    return this.prisma.forUser(userId, async (tx) => {
      return tx.workspace.update({
        where: { id },
        data,
        include: { members: { include: { user: true } } },
      });
    });
  }

  async delete(id: string): Promise<void> {
    const userId = this.userContext.getCurrentUserId();
    if (!userId) throw new UnauthorizedException();

    await this.prisma.forUser(userId, async (tx) => {
      await tx.workspace.delete({ where: { id } });
    });
  }

  async findMember(workspaceId: string, userId: string) {
    return this.prisma.forUser(userId, async (tx) => {
      return tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
    });
  }

  async addMember(workspaceId: string, userId: string, role: Role) {
    const currentUserId = this.userContext.getCurrentUserId();
    if (!currentUserId) throw new UnauthorizedException();

    return this.prisma.forUser(currentUserId, async (tx) => {
      return tx.workspaceMember.create({
        data: { workspaceId, userId, role },
      });
    });
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const currentUserId = this.userContext.getCurrentUserId();
    if (!currentUserId) throw new UnauthorizedException();

    await this.prisma.forUser(currentUserId, async (tx) => {
      await tx.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
    });
  }

  async getMembers(workspaceId: string) {
    const userId = this.userContext.getCurrentUserId();
    if (!userId) throw new UnauthorizedException();

    return this.prisma.forUser(userId, async (tx) => {
      return tx.workspaceMember.findMany({
        where: { workspaceId },
        include: { user: true },
      });
    });
  }
}
