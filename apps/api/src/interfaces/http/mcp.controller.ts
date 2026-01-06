import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseFilters,
  UseGuards,
  Ip,
  Headers,
  Logger,
  Res,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { McpThrottlerGuard } from './mcp-throttler.guard';
import { PublicLinkService } from '@/application/public-link/public-link.service';
import { UsageEventService } from '@/application/usage-event/usage-event.service';
import { McpExceptionFilter } from './mcp-exception.filter';
import { McpRequestException } from './mcp-request.exception';
import {
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpSearchResult,
  McpSearchArguments,
  McpErrorCode,
  McpInitializeResponse,
  McpToolsListResponse,
  McpBaseRequest,
} from '@/types/mcp.types';

// ============================================================================
// Constants
// ============================================================================

const MCP_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18'];
const MCP_SERVER_NAME = 'Synjar MCP Server';
const MCP_SERVER_VERSION = '1.0.0';

// Token format: 64 hex characters (32 bytes), lowercase only
const isValidToken = (token: string): boolean => {
  return /^[a-f0-9]{64}$/.test(token);
};

/**
 * MCP (Model Context Protocol) Controller
 *
 * Provides JSON-RPC endpoint for LLM tools (ChatGPT, Claude, CLI clients)
 * to search Synjar knowledge bases.
 *
 * Endpoints:
 * - POST /mcp/:token - JSON-RPC requests (initialize, tools/list, tools/call)
 * - GET /mcp/:token - Returns 405 (SSE not supported)
 *
 * Security:
 * - Rate limiting: 100 req/min per token (prevents abuse)
 * - Token validation: 64 hex format + DB lookup (defense in depth)
 * - Deep JSON-RPC validation (prevents injection attacks)
 * - RLS context from PublicLink workspace
 *
 * Privacy:
 * - Query text stored only when historyMode=ON
 * - IP/User-Agent hashed (one-way)
 * - Query text scrubbed after 90 days
 *
 * Note: CORS is disabled - MCP servers are accessed from CLI/backend,
 * not browsers. This allows any client to connect without origin restrictions.
 */
@Controller('mcp')
@UseFilters(McpExceptionFilter)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly publicLinkService: PublicLinkService,
    private readonly usageEventService: UsageEventService,
  ) {}

  // ==========================================================================
  // GET Handler - Returns 405 (SSE not supported)
  // ==========================================================================

  /**
   * GET /mcp/:token - SSE not supported
   *
   * Security: Does NOT validate token to prevent enumeration attacks
   * (different responses for valid/invalid tokens would leak information)
   */
  @Get(':token')
  @UseGuards(McpThrottlerGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  handleGetRequest(@Res() res: Response): void {
    // DO NOT validate token - prevents enumeration via different responses
    // Always return 405 for all GET requests
    res.status(405).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: McpErrorCode.METHOD_NOT_FOUND,
        message: 'Method not allowed. Use POST for JSON-RPC requests.',
      },
    });
  }

  // ==========================================================================
  // POST Handler - JSON-RPC endpoint with method routing
  // ==========================================================================

  /**
   * POST /mcp/:token - Main JSON-RPC endpoint
   *
   * Handles methods: initialize, tools/list, tools/call
   *
   * Security:
   * - Rate limiting: 100 req/min per token
   * - Token validation: format + DB lookup for ALL methods
   */
  @Post(':token')
  @HttpCode(200)
  @UseGuards(McpThrottlerGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async handleMcpRequest(
    @Param('token') token: string,
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('content-type') contentType?: string,
  ): Promise<McpJsonRpcResponse | McpInitializeResponse | McpToolsListResponse> {
    // 0. Content-Type validation
    if (contentType && !contentType.includes('application/json')) {
      throw new McpRequestException(
        'Content-Type must be application/json',
        McpErrorCode.INVALID_REQUEST,
      );
    }

    // 1. Token format validation (defense in depth)
    if (!isValidToken(token)) {
      this.logger.warn({
        event: 'MCP_INVALID_TOKEN_FORMAT',
        token: token.substring(0, 8) + '...',
        ip,
      });
      throw new McpRequestException(
        'Invalid token format',
        McpErrorCode.INVALID_PARAMS,
      );
    }

    // 2. Parse basic JSON-RPC structure
    const baseRequest = this.parseBaseRequest(body);

    // 3. Log successful request (structured logging for audit/monitoring)
    this.logger.log({
      event: 'MCP_REQUEST',
      method: baseRequest.method,
      requestId: baseRequest.id,
      tokenPrefix: token.substring(0, 8),
      ip,
    });

    // 4. Route by method
    switch (baseRequest.method) {
      case 'initialize':
        return this.handleInitialize(baseRequest, token);

      case 'tools/list':
        return this.handleToolsList(baseRequest, token);

      case 'tools/call':
        return this.handleToolsCall(baseRequest, token, ip, userAgent);

      default:
        throw new McpRequestException(
          `Method not found: ${baseRequest.method}`,
          McpErrorCode.METHOD_NOT_FOUND,
        );
    }
  }

  // ==========================================================================
  // Initialize Handler
  // ==========================================================================

  /**
   * Handle initialize method
   *
   * Returns server capabilities and protocol version
   * CRITICAL: Validates token with DB lookup (prevents enumeration)
   */
  private async handleInitialize(
    request: McpBaseRequest,
    token: string,
  ): Promise<McpInitializeResponse> {
    // Validate initialize params structure and extract protocolVersion
    const params = this.validateInitializeParams(request.params);

    // Validate protocol version if provided
    if (params?.protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion)) {
      throw new McpRequestException(
        `Unsupported protocol version: ${params.protocolVersion}. Supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`,
        McpErrorCode.INVALID_PARAMS,
      );
    }

    // CRITICAL: Full token validation (DB lookup) - prevents enumeration attacks
    await this.publicLinkService.validateToken(token);
    // RLS context now set to link.workspaceId

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION,
        },
      },
    };
  }

  // ==========================================================================
  // Tools List Handler
  // ==========================================================================

  /**
   * Handle tools/list method
   *
   * Returns list of available tools with their schemas
   */
  private async handleToolsList(
    request: McpBaseRequest,
    token: string,
  ): Promise<McpToolsListResponse> {
    // Validate token and get allowed tags for dynamic description
    const link = await this.publicLinkService.validateToken(token);

    const tagsDescription =
      link.allowedTags.length > 0
        ? `Filter by document tags. Allowed: ${link.allowedTags.join(', ')}`
        : 'Filter by document tags (all tags allowed)';

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: [
          {
            name: 'synjar_search',
            description: `Search the Synjar knowledge base.${
              link.allowedTags.length > 0
                ? ` Available tags: ${link.allowedTags.join(', ')}`
                : ''
            }`,
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Natural language search query (2-256 characters)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results to return (default: 5, max: 20)',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: tagsDescription,
                },
              },
              required: ['query'],
            },
          },
        ],
      },
    };
  }

  // ==========================================================================
  // Tools Call Handler (existing implementation, refactored)
  // ==========================================================================

  /**
   * Handle tools/call method
   *
   * Executes synjar_search tool
   */
  private async handleToolsCall(
    request: McpBaseRequest,
    token: string,
    ip: string,
    userAgent?: string,
  ): Promise<McpJsonRpcResponse> {
    const startTime = Date.now();

    // 1. Validate tools/call specific request structure
    const validatedRequest = this.validateToolsCallRequest(request);

    // 2. Validate PublicLink (includes isActive, expiresAt checks)
    const link = await this.publicLinkService.validateToken(token);

    // 3. Validate arguments (query, limit, tags)
    const { query, limit, tags } = this.validateArguments(
      validatedRequest.params.arguments,
      link.allowedTags,
    );

    // 4. Execute search (RLS context set by PublicLinkService)
    const searchResult = await this.publicLinkService.searchPublic(token, {
      query,
      limit,
      tags,
    });

    const latencyMs = Date.now() - startTime;
    const resultsCount =
      'results' in searchResult
        ? searchResult.results.length
        : searchResult.documents.length;

    // 5. Log successful search (structured logging for audit/monitoring)
    this.logger.log({
      event: 'MCP_SEARCH_SUCCESS',
      tokenPrefix: token.substring(0, 8),
      query,
      resultsCount,
    });

    // 6. Emit usage event (async, fire-and-forget)
    this.usageEventService
      .create({
        workspaceId: link.workspaceId,
        searchLinkId: link.id,
        source: 'MCP_SEARCH',
        queryStored: link.historyMode === 'ON',
        queryText: query,
        resultCount: resultsCount,
        latencyMs,
        ip,
        userAgent,
      })
      .catch((error) => {
        this.logger.error('Failed to create usage event', error);
      });

    // 6. Update daily aggregates (async, fire-and-forget)
    this.usageEventService
      .updateDailyAggregates(link.workspaceId, 'MCP_SEARCH', link.id)
      .catch((error) => {
        this.logger.error('Failed to update daily aggregates', error);
      });

    // 7. Format response for MCP
    const mcpResult = this.formatMcpSearchResult(searchResult);

    // 8. Return MCP JSON-RPC response
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

  // ==========================================================================
  // Request Validation Methods
  // ==========================================================================

  /**
   * Validate initialize method params
   */
  private validateInitializeParams(params: unknown): { protocolVersion?: string; capabilities?: Record<string, unknown>; clientInfo?: { name: string; version: string } } | undefined {
    if (params === undefined || params === null) {
      return undefined;
    }

    if (typeof params !== 'object' || Array.isArray(params)) {
      throw new McpRequestException('Invalid initialize params: expected object', McpErrorCode.INVALID_PARAMS);
    }

    const p = params as Record<string, unknown>;

    // protocolVersion is optional but if provided must be a string
    if (p.protocolVersion !== undefined && typeof p.protocolVersion !== 'string') {
      throw new McpRequestException('Invalid protocolVersion: expected string', McpErrorCode.INVALID_PARAMS);
    }

    return p as { protocolVersion?: string; capabilities?: Record<string, unknown>; clientInfo?: { name: string; version: string } };
  }

  /**
   * Parse basic JSON-RPC structure (method-agnostic)
   */
  private parseBaseRequest(body: unknown): McpBaseRequest {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new McpRequestException(
        'Invalid JSON-RPC request',
        McpErrorCode.INVALID_REQUEST,
      );
    }

    const req = body as Record<string, unknown>;

    // Validate required fields
    if (req.jsonrpc !== '2.0') {
      throw new McpRequestException(
        'Invalid JSON-RPC version',
        McpErrorCode.INVALID_REQUEST,
      );
    }
    if (typeof req.id !== 'string' && typeof req.id !== 'number') {
      throw new McpRequestException(
        'Invalid request ID',
        McpErrorCode.INVALID_REQUEST,
      );
    }
    if (typeof req.method !== 'string') {
      throw new McpRequestException(
        'Invalid method',
        McpErrorCode.INVALID_REQUEST,
      );
    }

    return {
      jsonrpc: '2.0',
      id: req.id as string | number,
      method: req.method,
      params: req.params,
    };
  }

  /**
   * Validate tools/call specific request structure
   */
  private validateToolsCallRequest(request: McpBaseRequest): McpJsonRpcRequest {
    if (!request.params || typeof request.params !== 'object') {
      throw new McpRequestException(
        'Missing params',
        McpErrorCode.INVALID_REQUEST,
      );
    }

    const params = request.params as Record<string, unknown>;
    if (params.name !== 'synjar_search') {
      throw new McpRequestException(
        'Unsupported tool',
        McpErrorCode.INVALID_PARAMS,
      );
    }
    if (!params.arguments || typeof params.arguments !== 'object') {
      throw new McpRequestException(
        'Missing arguments',
        McpErrorCode.INVALID_REQUEST,
      );
    }

    // Prevent prototype pollution
    const args = params.arguments as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(args, '__proto__') ||
      Object.prototype.hasOwnProperty.call(args, 'constructor') ||
      Object.prototype.hasOwnProperty.call(args, 'prototype')
    ) {
      throw new McpRequestException(
        'Invalid arguments',
        McpErrorCode.INVALID_PARAMS,
      );
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      method: 'tools/call',
      params: {
        name: 'synjar_search',
        arguments: args,
      },
    };
  }

  /**
   * Validate and extract search arguments
   */
  private validateArguments(
    args: Record<string, unknown>,
    allowedTags: string[],
  ): McpSearchArguments {
    // Query validation
    const query = args.query;
    if (typeof query !== 'string') {
      throw new McpRequestException(
        'Query must be a string',
        McpErrorCode.INVALID_PARAMS,
      );
    }
    if (query.length < 2 || query.length > 256) {
      throw new McpRequestException(
        'Query must be 2-256 characters',
        McpErrorCode.INVALID_PARAMS,
      );
    }

    // Limit validation
    const limit = typeof args.limit === 'number' ? args.limit : 5;
    if (limit < 1 || limit > 20) {
      throw new McpRequestException(
        'Limit must be 1-20',
        McpErrorCode.INVALID_PARAMS,
      );
    }

    // Tags validation
    let tags: string[] = [];
    if (args.tags !== undefined) {
      if (!Array.isArray(args.tags)) {
        throw new McpRequestException(
          'Tags must be an array',
          McpErrorCode.INVALID_PARAMS,
        );
      }
      if (!args.tags.every((t) => typeof t === 'string')) {
        throw new McpRequestException(
          'Tags must be strings',
          McpErrorCode.INVALID_PARAMS,
        );
      }
      tags = args.tags as string[];

      // Validate tags against allowedTags
      const invalidTags = tags.filter((t) => !allowedTags.includes(t));
      if (invalidTags.length > 0) {
        throw new McpRequestException(
          `Tags not allowed: ${invalidTags.join(', ')}`,
          McpErrorCode.INVALID_PARAMS,
          { invalidTags, allowedTags },
        );
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
