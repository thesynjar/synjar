import { Module } from '@nestjs/common';
import { UsageEventService } from './usage-event.service';
import { UsageEventCleanupService } from './usage-event-cleanup.service';
import { McpController } from '../../interfaces/http/mcp.controller';
import { PublicLinkModule } from '../public-link/public-link.module';
import { PrismaModule } from '../../infrastructure/persistence/prisma/prisma.module';

/**
 * UsageEventModule
 *
 * Provides unified usage event tracking for all public knowledge access:
 * - Search Links (direct)
 * - Search Links via MCP
 * - Instruction Sets
 *
 * Includes:
 * - UsageEventService: Records usage events with privacy controls
 * - UsageEventCleanupService: Scrubs queryText after 90 days
 * - McpController: MCP (Model Context Protocol) JSON-RPC endpoint
 */
@Module({
  imports: [PrismaModule, PublicLinkModule],
  controllers: [McpController],
  providers: [UsageEventService, UsageEventCleanupService],
  exports: [UsageEventService, UsageEventCleanupService],
})
export class UsageEventModule {}
