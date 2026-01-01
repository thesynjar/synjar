import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { UsageEventSource } from '@prisma/client';
import { createHash } from 'crypto';

interface CreateUsageEventDto {
  workspaceId: string;
  searchLinkId?: string;
  instructionSetId?: string;
  source: UsageEventSource;
  queryText?: string;
  queryStored: boolean;
  resultCount: number;
  latencyMs: number;
  ip?: string;
  userAgent?: string;
}

/**
 * UsageEventService
 *
 * Unified event recording for all public knowledge access:
 * - Search Links (direct)
 * - Search Links via MCP
 * - Instruction Sets
 *
 * Privacy-first design:
 * - Query text stored only when historyMode=ON
 * - IP and User-Agent hashed (one-way, cannot reverse)
 * - Query text scrubbed after 90 days
 */
@Injectable()
export class UsageEventService {
  private readonly logger = new Logger(UsageEventService.name);
  private readonly SALT = process.env.USAGE_EVENT_SALT || 'default-salt-change-me';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a usage event for public access
   *
   * @param dto Event data
   * @returns Created event ID
   */
  async create(dto: CreateUsageEventDto): Promise<string> {
    const startTime = Date.now();

    // Hash IP and User-Agent for privacy (one-way hashing)
    const ipHash = dto.ip
      ? createHash('sha256').update(dto.ip + this.SALT).digest('hex')
      : null;
    const userAgentHash = dto.userAgent
      ? createHash('sha256').update(dto.userAgent + this.SALT).digest('hex')
      : null;

    try {
      const event = await this.prisma.usageEvent.create({
        data: {
          workspaceId: dto.workspaceId,
          searchLinkId: dto.searchLinkId,
          instructionSetId: dto.instructionSetId,
          source: dto.source,
          queryStored: dto.queryStored,
          queryText: dto.queryStored ? dto.queryText : null,
          resultCount: dto.resultCount,
          latencyMs: dto.latencyMs,
          ipHash,
          userAgentHash,
        },
      });

      const recordTime = Date.now() - startTime;
      if (recordTime > 100) {
        this.logger.warn(
          `Slow usage event creation: ${recordTime}ms (workspace: ${dto.workspaceId}, source: ${dto.source})`,
        );
      }

      return event.id;
    } catch (error) {
      this.logger.error('Failed to create usage event', error);
      // Don't throw - usage event creation should not break the main flow
      return 'failed';
    }
  }

  /**
   * Update daily aggregates for a workspace
   *
   * Called asynchronously (fire-and-forget) to avoid blocking the main flow
   *
   * Uses find-then-update pattern because:
   * 1. PostgreSQL treats NULL values as distinct in unique constraints
   * 2. Prisma's upsert doesn't support NULL in compound unique where clauses
   */
  async updateDailyAggregates(
    workspaceId: string,
    source: UsageEventSource,
    searchLinkId?: string,
    instructionSetId?: string,
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Find existing record with proper NULL handling
      const existing = await this.prisma.usageDaily.findFirst({
        where: {
          workspaceId,
          source,
          date: today,
          searchLinkId: searchLinkId ?? null,
          instructionSetId: instructionSetId ?? null,
        },
      });

      if (existing) {
        // Update existing record
        await this.prisma.usageDaily.update({
          where: { id: existing.id },
          data: { requestCount: { increment: 1 } },
        });
      } else {
        // Create new record
        await this.prisma.usageDaily.create({
          data: {
            workspaceId,
            source,
            date: today,
            searchLinkId: searchLinkId ?? null,
            instructionSetId: instructionSetId ?? null,
            requestCount: 1,
            avgLatencyMs: 0,
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to update daily aggregates', error);
      // Don't throw - this is background work
    }
  }
}
