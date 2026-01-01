import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';

/**
 * UsageEventCleanupService
 *
 * Scrubs queryText from UsageEvent after 90 days (GDPR compliance)
 *
 * Why NestJS @Cron instead of pg_cron:
 * - Works in both Cloud and Self-hosted (pg_cron requires extension)
 * - Easier to test (can call method directly in tests)
 * - Logs visible in application logs (not just Postgres logs)
 *
 * Runs daily at 2am UTC
 */
@Injectable()
export class UsageEventCleanupService {
  private readonly logger = new Logger(UsageEventCleanupService.name);
  private readonly RETENTION_DAYS = 90;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scrub queryText from old usage events (daily at 2am UTC)
   *
   * UPDATE (not DELETE) to preserve billing counts
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldQueryText() {
    const startTime = Date.now();
    this.logger.log('Starting queryText cleanup (90-day retention)...');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);

      const result = await this.prisma.$executeRaw`
        UPDATE "UsageEvent"
        SET "queryText" = NULL
        WHERE "queryStored" = true
          AND "createdAt" < ${cutoffDate}
          AND "queryText" IS NOT NULL
      `;

      const duration = Date.now() - startTime;
      this.logger.log(
        `Cleaned up ${result} old query texts (retention: ${this.RETENTION_DAYS} days, duration: ${duration}ms)`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup old query texts', error);
      // Don't throw - cleanup should not break the app
    }
  }

  /**
   * Manual trigger for cleanup (used in tests and admin tools)
   */
  async triggerCleanup(): Promise<number> {
    const startTime = Date.now();
    this.logger.log('Manual queryText cleanup triggered...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);

    const result = await this.prisma.$executeRaw<number>`
      UPDATE "UsageEvent"
      SET "queryText" = NULL
      WHERE "queryStored" = true
        AND "createdAt" < ${cutoffDate}
        AND "queryText" IS NOT NULL
    `;

    const duration = Date.now() - startTime;
    this.logger.log(
      `Manual cleanup completed: ${result} records (duration: ${duration}ms)`,
    );

    return result;
  }
}
