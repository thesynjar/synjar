import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Separate Prisma client for system operations that bypass RLS.
 * Uses direct connection as superuser (for migrations, seeding, tests).
 *
 * IMPORTANT: Only use this for:
 * - Test data setup/teardown
 * - Migrations
 * - System administration
 *
 * For normal operations, use PrismaService with RLS context.
 */
@Injectable()
export class PrismaSystemService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Use the migration URL which has superuser privileges
    super({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL,
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
