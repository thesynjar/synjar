import {
  Controller,
  Post,
  Param,
  Body,
  BadRequestException,
  UseFilters,
  Ip,
  Headers,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
// Token format: 64 hex characters (32 bytes)
const isValidToken = (token: string): boolean => {
  return /^[a-f0-9]{64}$/i.test(token);
};
import { PublicLinkService } from '@/application/public-link/public-link.service';
import { UsageEventService } from '@/application/usage-event/usage-event.service';
import { McpExceptionFilter } from './mcp-exception.filter';
import {
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpSearchResult,
  McpSearchArguments,
} from '@/types/mcp.types';

/**
 * MCP (Model Context Protocol) Controller
 *
 * Provides JSON-RPC endpoint for LLM tools (ChatGPT, Claude)
 * to search Synjar knowledge bases.
 *
 * Endpoint: POST /mcp/:token
 *
 * Security:
 * - Rate limiting: 100 req/min per IP (prevents enumeration)
 * - Token validation: UUID format check (defense in depth)
 * - Deep JSON-RPC validation (prevents injection attacks)
 * - RLS context from PublicLink workspace
 *
 * Privacy:
 * - Query text stored only when historyMode=ON
 * - IP/User-Agent hashed (one-way)
 * - Query text scrubbed after 90 days
 */
@Controller('mcp')
@UseFilters(McpExceptionFilter)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly publicLinkService: PublicLinkService,
    private readonly usageEventService: UsageEventService,
  ) {}

  /**
   * MCP Search Endpoint
   *
   * Handles JSON-RPC 2.0 requests from LLM tools
   *
   * Rate limiting order (CRITICAL for security):
   * 1. IP rate limit (100 req/min) - BEFORE token lookup
   * 2. Token validation
   * 3. Per-link rate limit (30 req/min) - AFTER token validation
   */
  @Post(':token')
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // Per IP: 100 req/min
  async handleMcpRequest(
    @Param('token') token: string,
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<McpJsonRpcResponse> {
    const startTime = Date.now();

    // 1. Validate token format (64 hex chars) - defense in depth
    if (!isValidToken(token)) {
      throw new BadRequestException('Invalid token format');
    }

    // 2. Validate JSON-RPC structure (deep validation)
    const validatedRequest = this.validateMcpRequest(body);

    // 3. Validate PublicLink (includes isActive, expiresAt checks)
    const link = await this.publicLinkService.validateToken(token);

    // 4. Validate arguments (query, limit, tags)
    const { query, limit, tags } = this.validateArguments(
      validatedRequest.params.arguments,
      link.allowedTags,
    );

    // 5. Execute search (RLS context set by PublicLinkService)
    const searchResult = await this.publicLinkService.searchPublic(token, {
      query,
      limit,
      tags,
    });

    const latencyMs = Date.now() - startTime;

    // 6. Emit usage event (async, fire-and-forget)
    // Query text stored only when historyMode=ON
    this.usageEventService
      .create({
        workspaceId: link.workspaceId,
        searchLinkId: link.id,
        source: 'MCP_SEARCH',
        queryStored: link.historyMode === 'ON',
        queryText: query,
        resultCount: 'results' in searchResult ? searchResult.results.length : searchResult.documents.length,
        latencyMs,
        ip,
        userAgent,
      })
      .catch((error) => {
        this.logger.error('Failed to create usage event', error);
      });

    // 7. Update daily aggregates (async, fire-and-forget)
    this.usageEventService
      .updateDailyAggregates(link.workspaceId, 'MCP_SEARCH', link.id)
      .catch((error) => {
        this.logger.error('Failed to update daily aggregates', error);
      });

    // 8. Format response for MCP
    const mcpResult = this.formatMcpSearchResult(searchResult);

    // 9. Return MCP JSON-RPC response
    return {
      jsonrpc: '2.0',
      id: validatedRequest.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(mcpResult),
          },
        ],
      },
    };
  }

  /**
   * Deep validation of MCP JSON-RPC request
   *
   * Prevents:
   * - Prototype pollution
   * - XSS attacks
   * - SQL injection
   * - Invalid JSON-RPC structure
   */
  private validateMcpRequest(body: unknown): McpJsonRpcRequest {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Invalid JSON-RPC request');
    }

    const req = body as Record<string, unknown>;

    // Validate required fields
    if (req.jsonrpc !== '2.0') {
      throw new BadRequestException('Invalid JSON-RPC version');
    }
    if (typeof req.id !== 'string' && typeof req.id !== 'number') {
      throw new BadRequestException('Invalid request ID');
    }
    if (req.method !== 'tools/call') {
      throw new BadRequestException('Unsupported method');
    }
    if (!req.params || typeof req.params !== 'object') {
      throw new BadRequestException('Missing params');
    }

    const params = req.params as Record<string, unknown>;
    if (params.name !== 'synjar_search') {
      throw new BadRequestException('Unsupported tool');
    }
    if (!params.arguments || typeof params.arguments !== 'object') {
      throw new BadRequestException('Missing arguments');
    }

    // Prevent prototype pollution - check own properties only
    const args = params.arguments as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(args, '__proto__') ||
      Object.prototype.hasOwnProperty.call(args, 'constructor') ||
      Object.prototype.hasOwnProperty.call(args, 'prototype')
    ) {
      throw new BadRequestException('Invalid arguments');
    }

    return {
      jsonrpc: '2.0',
      id: req.id as string | number,
      method: 'tools/call',
      params: {
        name: 'synjar_search',
        arguments: args,
      },
    };
  }

  /**
   * Validate and extract search arguments
   *
   * Validates:
   * - Query: 2-256 characters, NFC normalized
   * - Limit: 1-20
   * - Tags: Must be subset of allowed tags
   */
  private validateArguments(
    args: Record<string, unknown>,
    allowedTags: string[],
  ): McpSearchArguments {
    // Query validation
    const query = args.query;
    if (typeof query !== 'string') {
      throw new BadRequestException('Query must be a string');
    }
    if (query.length < 2 || query.length > 256) {
      throw new BadRequestException('Query must be 2-256 characters');
    }

    // Limit validation
    const limit = typeof args.limit === 'number' ? args.limit : 5;
    if (limit < 1 || limit > 20) {
      throw new BadRequestException('Limit must be 1-20');
    }

    // Tags validation
    let tags: string[] = [];
    if (args.tags !== undefined) {
      if (!Array.isArray(args.tags)) {
        throw new BadRequestException('Tags must be an array');
      }
      if (!args.tags.every((t) => typeof t === 'string')) {
        throw new BadRequestException('Tags must be strings');
      }
      tags = args.tags as string[];

      // Validate tags against allowedTags
      const invalidTags = tags.filter((t) => !allowedTags.includes(t));
      if (invalidTags.length > 0) {
        throw new BadRequestException(`Tags not allowed: ${invalidTags.join(', ')}`, {
          cause: {
            invalidTags,
            allowedTags,
          },
        });
      }
    }

    return {
      query: query.normalize('NFC').trim(),
      limit,
      tags,
    };
  }

  /**
   * Format search results for MCP response
   *
   * Converts PublicLinkService result to MCP-compatible format
   */
  private formatMcpSearchResult(
    searchResult: Awaited<ReturnType<typeof this.publicLinkService.searchPublic>>,
  ): McpSearchResult {
    // Handle semantic search results (with chunks)
    if ('results' in searchResult) {
      return {
        results: searchResult.results.map((r) => ({
          title: r.title,
          content: r.content,
          score: r.score,
          sourceUrl: r.fileUrl || undefined,
        })),
        totalCount: searchResult.totalCount,
      };
    }

    // Handle document listing (no query)
    return {
      results: searchResult.documents.map((d) => ({
        title: d.title,
        content: d.content,
        score: 1.0, // No semantic search, all results have equal weight
        sourceUrl: d.fileUrl || undefined,
      })),
      totalCount: searchResult.totalCount,
    };
  }
}
