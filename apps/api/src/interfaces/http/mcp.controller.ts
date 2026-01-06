import * as crypto from 'crypto';
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
  NotFoundException,
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
const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
const MCP_SERVER_NAME = 'Synjar MCP Server';
const MCP_SERVER_VERSION = '1.0.0';

// Token format: 64 hex characters (32 bytes), case-insensitive
const isValidToken = (token: string): boolean => {
  return /^[a-f0-9]{64}$/i.test(token);
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
   * GET /mcp/:token - Health check for ChatGPT connector validation
   *
   * ChatGPT sends GET request before initializing MCP connection.
   * Returns 200 OK with server info (required for ChatGPT compatibility).
   *
   * Security: Does NOT validate token to prevent enumeration attacks
   * (different responses for valid/invalid tokens would leak information)
   */
  @Get(':token')
  @UseGuards(McpThrottlerGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  handleGetRequest(@Res() res: Response): void {
    // DO NOT validate token - prevents enumeration via different responses
    // Always return same response for all tokens (valid or invalid)
    res.status(200).json({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      protocolVersion: MCP_PROTOCOL_VERSION,
      status: 'ok',
      message: 'Use POST for JSON-RPC requests',
    });
  }

  // ==========================================================================
  // POST Handler - JSON-RPC endpoint with method routing
  // ==========================================================================

  /**
   * POST /mcp/:token - Main JSON-RPC endpoint with SSE response
   *
   * Handles methods: initialize, tools/list, tools/call
   * Returns SSE stream (text/event-stream) for ChatGPT compatibility.
   *
   * Security:
   * - Rate limiting: 100 req/min per token
   * - Token validation: format + DB lookup for ALL methods
   */
  @Post(':token')
  @UseGuards(McpThrottlerGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async handleMcpRequest(
    @Param('token') token: string,
    @Body() body: unknown,
    @Ip() ip: string,
    @Res() res: Response,
    @Headers('user-agent') userAgent?: string,
    @Headers('content-type') contentType?: string,
  ): Promise<void> {
    try {
      // 0. Content-Type validation
      if (contentType && !contentType.includes('application/json')) {
        this.sendSseError(res, null, McpErrorCode.INVALID_REQUEST, 'Content-Type must be application/json');
        return;
      }

      // 1. Token format validation (defense in depth)
      if (!isValidToken(token)) {
        this.logger.warn({
          event: 'MCP_INVALID_TOKEN_FORMAT',
          token: token.substring(0, 8) + '...',
          ip,
        });
        this.sendSseError(res, null, McpErrorCode.INVALID_PARAMS, 'Invalid token format', 400);
        return;
      }

      // 2. Parse basic JSON-RPC structure
      let baseRequest: McpBaseRequest;
      try {
        baseRequest = this.parseBaseRequest(body);
      } catch (error) {
        if (error instanceof McpRequestException) {
          this.sendSseError(res, null, error.errorCode, error.message, 400);
          return;
        }
        throw error;
      }

      // 3. Log successful request (structured logging for audit/monitoring)
      this.logger.log({
        event: 'MCP_REQUEST',
        method: baseRequest.method,
        requestId: baseRequest.id,
        tokenPrefix: token.substring(0, 8),
        ip,
      });

      // 4. Handle notifications (requests without id that don't expect a response)
      // Per MCP spec: notifications should return HTTP 202 Accepted with no body
      if (baseRequest.method.startsWith('notifications/')) {
        this.logger.log({
          event: 'MCP_NOTIFICATION',
          method: baseRequest.method,
          tokenPrefix: token.substring(0, 8),
        });
        // Return 202 Accepted with no body per MCP Streamable HTTP spec
        res.status(202).end();
        return;
      }

      // 5. Route by method and get response
      let response: McpJsonRpcResponse | McpInitializeResponse | McpToolsListResponse;
      try {
        switch (baseRequest.method) {
          case 'initialize':
            response = await this.handleInitialize(baseRequest, token);
            break;

          case 'tools/list':
            response = await this.handleToolsList(baseRequest, token);
            break;

          case 'tools/call':
            response = await this.handleToolsCallRouter(baseRequest, token, ip, userAgent);
            break;

          default:
            this.sendSseError(res, baseRequest.id, McpErrorCode.METHOD_NOT_FOUND, `Method not found: ${baseRequest.method}`, 400);
            return;
        }
      } catch (error) {
        if (error instanceof McpRequestException) {
          const status = error.errorCode === McpErrorCode.INVALID_PARAMS ? 400 :
                        error.message.includes('not found') ? 404 : 400;
          this.sendSseError(res, baseRequest.id, error.errorCode, error.message, status);
          return;
        }
        if (error instanceof NotFoundException) {
          this.sendSseError(res, baseRequest.id, McpErrorCode.INVALID_PARAMS, error.message, 404);
          return;
        }
        throw error;
      }

      // 5. Send SSE response
      this.sendSseResponse(res, response);
    } catch (error) {
      this.logger.error('Unexpected error in MCP handler', error);
      this.sendSseError(res, null, McpErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
    }
  }

  /**
   * Send SSE response with proper headers
   * Format: event: message\nid: <uuid>\ndata: <json>\n\n
   */
  private sendSseResponse(res: Response, data: unknown): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(200);
    const eventId = crypto.randomUUID();
    res.write(`event: message\n`);
    res.write(`id: ${eventId}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.end();
  }

  /**
   * Send SSE error response
   * Format: event: message\nid: <uuid>\ndata: <json>\n\n
   */
  private sendSseError(
    res: Response,
    id: string | number | null,
    code: McpErrorCode,
    message: string,
    httpStatus: number = 400,
  ): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(httpStatus);
    const eventId = crypto.randomUUID();
    res.write(`event: message\n`);
    res.write(`id: ${eventId}\n`);
    res.write(`data: ${JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    })}\n\n`);
    res.end();
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

    // Log protocol version for debugging
    this.logger.log({
      event: 'MCP_INITIALIZE',
      tokenPrefix: token.substring(0, 8),
      clientProtocolVersion: params?.protocolVersion ?? 'not provided',
      serverProtocolVersion: MCP_PROTOCOL_VERSION,
    });

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

    // Respond with client's requested version if supported, otherwise use server default
    const negotiatedVersion = params?.protocolVersion && SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion)
      ? params.protocolVersion
      : MCP_PROTOCOL_VERSION;

    // Non-null assertion: notifications are filtered before reaching this point
    return {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        protocolVersion: negotiatedVersion,
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
   * Returns list of available tools with their schemas.
   * Includes 'search' and 'fetch' (required by ChatGPT) plus 'synjar_search' for compatibility.
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

    const searchInputSchema = {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query (2-256 characters)',
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
    };

    return {
      jsonrpc: '2.0',
      id: request.id!,  // Non-null assertion: notifications filtered earlier
      result: {
        tools: [
          // 'search' - required by ChatGPT for Deep Research mode
          {
            name: 'search',
            description: `Search the knowledge base. Returns relevant documents ranked by semantic similarity.${
              link.allowedTags.length > 0
                ? ` Available tags: ${link.allowedTags.join(', ')}`
                : ''
            }`,
            inputSchema: searchInputSchema,
          },
          // 'fetch' - required by ChatGPT for Deep Research mode
          {
            name: 'fetch',
            description:
              'Fetch a specific document by ID. Returns full document content.',
            inputSchema: {
              type: 'object' as const,
              properties: {
                id: {
                  type: 'string',
                  description: 'Document ID to fetch',
                },
              },
              required: ['id'],
            },
          },
        ],
      },
    };
  }

  // ==========================================================================
  // Tools Call Router
  // ==========================================================================

  /**
   * Route tools/call to appropriate handler based on tool name
   *
   * Supports:
   * - 'search' (ChatGPT standard)
   * - 'fetch' (ChatGPT standard)
   * - 'synjar_search' (backward compatibility)
   */
  private async handleToolsCallRouter(
    request: McpBaseRequest,
    token: string,
    ip: string,
    userAgent?: string,
  ): Promise<McpJsonRpcResponse> {
    // Extract tool name from params
    const params = request.params as Record<string, unknown> | undefined;
    const toolName = params?.name as string | undefined;

    if (!toolName) {
      throw new McpRequestException(
        'Missing tool name in params',
        McpErrorCode.INVALID_PARAMS,
      );
    }

    // Route to appropriate handler
    switch (toolName) {
      case 'search':
        return this.handleSearch(request, token, ip, userAgent);

      case 'fetch':
        return this.handleFetch(request, token);

      default:
        throw new McpRequestException(
          `Unknown tool: ${toolName}`,
          McpErrorCode.INVALID_PARAMS,
        );
    }
  }

  // ==========================================================================
  // Search Handler
  // ==========================================================================

  /**
   * Handle search/synjar_search tool call
   *
   * Executes semantic search on the knowledge base
   */
  private async handleSearch(
    request: McpBaseRequest,
    token: string,
    ip: string,
    userAgent?: string,
  ): Promise<McpJsonRpcResponse> {
    const startTime = Date.now();

    // 1. Validate tools/call specific request structure
    const validatedRequest = this.validateSearchRequest(request);

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
  // Fetch Handler
  // ==========================================================================

  /**
   * Handle fetch tool call
   *
   * Fetches a specific document by ID
   */
  private async handleFetch(
    request: McpBaseRequest,
    token: string,
  ): Promise<McpJsonRpcResponse> {
    // 1. Validate PublicLink (includes isActive, expiresAt checks)
    const link = await this.publicLinkService.validateToken(token);

    // 2. Extract and validate arguments
    const params = request.params as Record<string, unknown> | undefined;
    const args = params?.arguments as Record<string, unknown> | undefined;

    if (!args) {
      throw new McpRequestException(
        'Missing arguments',
        McpErrorCode.INVALID_PARAMS,
      );
    }

    // Prevent prototype pollution
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

    const documentId = args.id as string | undefined;

    if (!documentId || typeof documentId !== 'string') {
      throw new McpRequestException(
        'Document ID is required',
        McpErrorCode.INVALID_PARAMS,
      );
    }

    // 3. Fetch document (RLS context set by PublicLinkService)
    const document = await this.publicLinkService.fetchDocument(token, documentId);

    if (!document) {
      throw new McpRequestException(
        'Document not found',
        McpErrorCode.INVALID_PARAMS,
      );
    }

    // 4. Log successful fetch
    this.logger.log({
      event: 'MCP_FETCH_SUCCESS',
      tokenPrefix: token.substring(0, 8),
      documentId,
    });

    // 5. Emit usage event (async, fire-and-forget)
    this.usageEventService
      .create({
        workspaceId: link.workspaceId,
        searchLinkId: link.id,
        source: 'MCP_SEARCH',
        queryStored: false,
        queryText: undefined,
        resultCount: 1,
        latencyMs: 0,
        ip: '',
        userAgent: undefined,
      })
      .catch((error) => {
        this.logger.error('Failed to create usage event for fetch', error);
      });

    // 6. Return MCP JSON-RPC response
    return {
      jsonrpc: '2.0',
      id: request.id!,  // Non-null assertion: notifications filtered earlier
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: document.id,
              title: document.title,
              content: document.content,
              sourceUrl: document.fileUrl,
              tags: document.tags,
              updatedAt: document.updatedAt,
            }),
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
    if (typeof req.method !== 'string') {
      throw new McpRequestException(
        'Invalid method',
        McpErrorCode.INVALID_REQUEST,
      );
    }

    // JSON-RPC notifications don't have an id field - they're fire-and-forget
    // Regular requests MUST have an id field
    const isNotification = req.method.startsWith('notifications/');
    if (!isNotification && typeof req.id !== 'string' && typeof req.id !== 'number') {
      throw new McpRequestException(
        'Invalid request ID',
        McpErrorCode.INVALID_REQUEST,
      );
    }

    return {
      jsonrpc: '2.0',
      id: (req.id as string | number) ?? null,
      method: req.method,
      params: req.params,
    };
  }

  /**
   * Validate tools/call specific request structure for search tools
   */
  private validateSearchRequest(request: McpBaseRequest): McpJsonRpcRequest {
    if (!request.params || typeof request.params !== 'object') {
      throw new McpRequestException(
        'Missing params',
        McpErrorCode.INVALID_REQUEST,
      );
    }

    const params = request.params as Record<string, unknown>;
    if (params.name !== 'search') {
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
      id: request.id!,  // Non-null assertion: notifications filtered earlier
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
