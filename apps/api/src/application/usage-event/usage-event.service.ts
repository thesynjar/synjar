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
      // Upsert daily aggregate
      await this.prisma.usageDaily.upsert({
        where: {
          workspaceId_source_date_searchLinkId_instructionSetId: {
            workspaceId,
            source,
            date: today,
            searchLinkId: searchLinkId || (null as any),
            instructionSetId: instructionSetId || (null as any),
          },
        },
        create: {
          workspaceId,
          source,
          date: today,
          searchLinkId: searchLinkId || undefined,
          instructionSetId: instructionSetId || undefined,
          requestCount: 1,
          avgLatencyMs: 0, // Will be computed in background job
        },
        update: {
          requestCount: {
            increment: 1,
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to update daily aggregates', error);
      // Don't throw - this is background work
    }
  }
}
