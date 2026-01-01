import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IPublicLinkRepository,
  CreatePublicLinkData,
  PublicLinkWithWorkspace,
} from '../../../domain/public-link/public-link.repository';
import { PublicLink } from '@prisma/client';

@Injectable()
export class PrismaPublicLinkRepository implements IPublicLinkRepository {
  private readonly logger = new Logger(PrismaPublicLinkRepository.name);

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

  async updateWithUser(
    userId: string,
    id: string,
    data: Partial<{ historyMode: 'ON' | 'OFF' }>,
  ): Promise<PublicLink> {
    return this.prisma.forUser(userId, async (tx) => {
      return tx.publicLink.update({
        where: { id },
        data,
      });
    });
  }

  async deleteWithUser(userId: string, id: string): Promise<void> {
    await this.prisma.forUser(userId, async (tx) => {
      await tx.publicLink.delete({ where: { id } });
    });
  }

  /**
   * Validates a public link token using SECURITY DEFINER function.
   *
   * SECURITY NOTE: This method bypasses RLS using a PostgreSQL SECURITY DEFINER
   * function to allow unauthenticated token lookups. The token acts as the
   * authorization mechanism.
   *
   * The SQL function verifies:
   * - Token exists in database
   * - Link is active (isActive = true)
   * - Link has not expired (expiresAt > NOW or NULL)
   *
   * @param token - Cryptographic token (32 bytes = 64 hex chars)
   * @returns PublicLink with workspace info, or null if not found/inactive/expired
   *
   * @see migrations/20251229100000_add_public_link_token_lookup_function
   * @see migrations/20251229110000_fix_public_link_token_lookup_function
   * @security Uses lookup_public_link_by_token() SQL function (SECURITY DEFINER)
   */
  async findByTokenWithWorkspace(token: string): Promise<PublicLinkWithWorkspace | null> {
    // Audit log for SECURITY DEFINER function usage
    this.logger.debug({
      event: 'SECURITY_DEFINER_CALL',
      function: 'lookup_public_link_by_token',
      tokenPrefix: token.length >= 8 ? `${token.substring(0, 8)}...` : 'invalid',
      timestamp: new Date().toISOString(),
    });

    // Use the secure SQL function that bypasses RLS
    // Note: Function validates isActive=true and expiresAt at database level
    const results = await this.prisma.$queryRaw<
      Array<{
        id: string;
        workspace_id: string;
        token: string;
        name: string | null;
        allowed_tags: string[];
        expires_at: Date | null;
        is_active: boolean;
        created_at: Date;
        workspace_name: string;
        workspace_created_by_id: string;
      }>
    >`SELECT * FROM lookup_public_link_by_token(${token})`;

    if (results.length === 0) {
      this.logger.debug({
        event: 'SECURITY_DEFINER_RESULT',
        function: 'lookup_public_link_by_token',
        result: 'NOT_FOUND',
        tokenPrefix: token.length >= 8 ? `${token.substring(0, 8)}...` : 'invalid',
      });
      return null;
    }

    const row = results[0];
    this.logger.debug({
      event: 'SECURITY_DEFINER_RESULT',
      function: 'lookup_public_link_by_token',
      result: 'FOUND',
      workspaceId: row.workspace_id,
      linkId: row.id,
    });

    return this.mapSqlRowToPublicLinkWithWorkspace(row);
  }

  /**
   * Maps SQL function result to PublicLinkWithWorkspace domain type.
   * Centralizes the snake_case → camelCase field mapping.
   */
  private mapSqlRowToPublicLinkWithWorkspace(row: {
    id: string;
    workspace_id: string;
    token: string;
    name: string | null;
    allowed_tags: string[];
    expires_at: Date | null;
    is_active: boolean;
    history_mode?: string;
    created_at: Date;
    workspace_name: string;
    workspace_created_by_id: string;
  }): PublicLinkWithWorkspace {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      token: row.token,
      name: row.name,
      allowedTags: row.allowed_tags,
      expiresAt: row.expires_at,
      isActive: row.is_active,
      historyMode: (row.history_mode || 'OFF') as 'ON' | 'OFF',
      createdAt: row.created_at,
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        createdById: row.workspace_created_by_id,
      },
    } as PublicLinkWithWorkspace;
  }
}
