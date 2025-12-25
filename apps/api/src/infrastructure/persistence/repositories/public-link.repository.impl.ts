import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IPublicLinkRepository,
  CreatePublicLinkData,
  PublicLinkWithWorkspace,
} from '../../../domain/public-link/public-link.repository';
import { PublicLink } from '@prisma/client';

@Injectable()
export class PrismaPublicLinkRepository implements IPublicLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Legacy methods (without RLS) - for backward compatibility
  async findById(id: string): Promise<PublicLink | null> {
    return this.prisma.publicLink.findUnique({ where: { id } });
  }

  async findByToken(token: string): Promise<PublicLink | null> {
    return this.prisma.publicLink.findUnique({ where: { token } });
  }

  async findByWorkspace(workspaceId: string): Promise<PublicLink[]> {
    return this.prisma.publicLink.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdAndWorkspace(id: string, workspaceId: string): Promise<PublicLink | null> {
    return this.prisma.publicLink.findFirst({
      where: { id, workspaceId },
    });
  }

  async create(data: CreatePublicLinkData): Promise<PublicLink> {
    return this.prisma.publicLink.create({
      data: {
        workspaceId: data.workspaceId,
        token: data.token,
        name: data.name,
        allowedTags: data.allowedTags || [],
        expiresAt: data.expiresAt,
      },
    });
  }

  async update(
    id: string,
    data: Partial<CreatePublicLinkData & { isActive: boolean }>,
  ): Promise<PublicLink> {
    return this.prisma.publicLink.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.publicLink.delete({ where: { id } });
  }

  // RLS-aware methods
  async createWithUser(userId: string, data: CreatePublicLinkData): Promise<PublicLink> {
    return this.prisma.forUser(userId, async (tx) => {
      return tx.publicLink.create({
        data: {
          workspaceId: data.workspaceId,
          token: data.token,
          name: data.name,
          allowedTags: data.allowedTags || [],
          expiresAt: data.expiresAt,
        },
      });
    });
  }

  async findAllWithUser(userId: string, workspaceId: string): Promise<PublicLink[]> {
    return this.prisma.forUser(userId, async (tx) => {
      return tx.publicLink.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async findOneWithUser(
    userId: string,
    id: string,
    workspaceId: string,
  ): Promise<PublicLink | null> {
    return this.prisma.forUser(userId, async (tx) => {
      return tx.publicLink.findFirst({
        where: { id, workspaceId },
      });
    });
  }

  async deleteWithUser(userId: string, id: string): Promise<void> {
    await this.prisma.forUser(userId, async (tx) => {
      await tx.publicLink.delete({ where: { id } });
    });
  }

  // System operations (bypass RLS for public token validation)
  async findByTokenWithWorkspace(token: string): Promise<PublicLinkWithWorkspace | null> {
    return this.prisma.withoutRls(async (tx) => {
      return tx.publicLink.findFirst({
        where: { token },
        include: {
          workspace: {
            select: { id: true, name: true, createdById: true },
          },
        },
      });
    });
  }
}
