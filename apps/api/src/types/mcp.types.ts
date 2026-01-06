/**
 * MCP (Model Context Protocol) JSON-RPC Types
 *
 * Specification: https://spec.modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */

// ============================================================================
// Initialize Method Types
// ============================================================================

export interface McpInitializeRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'initialize';
  params: {
    protocolVersion: string;
    capabilities?: Record<string, unknown>;
    clientInfo?: {
      name: string;
      version: string;
    };
  };
}

export interface McpInitializeResponse {
  jsonrpc: '2.0';
  id: string | number;
  result: {
    protocolVersion: string;
    capabilities: {
      tools: Record<string, never>;
    };
    serverInfo: {
      name: string;
      version: string;
    };
  };
}

// ============================================================================
// Tools List Method Types
// ============================================================================

export interface McpToolsListRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/list';
  params?: Record<string, never>;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description: string;
        items?: { type: string };
        enum?: string[];
      }
    >;
    required: string[];
  };
}

export interface McpToolsListResponse {
  jsonrpc: '2.0';
  id: string | number;
  result: {
    tools: McpToolDefinition[];
  };
}

// ============================================================================
// Tools Call Method Types (existing)
// ============================================================================

export interface McpToolsCallRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call';
  params: {
    name: 'synjar_search';
    arguments: Record<string, unknown>;
  };
}

/**
 * @deprecated Use McpToolsCallRequest instead
 */
export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call';
  params: {
    name: 'synjar_search';
    arguments: Record<string, unknown>;
  };
}

// ============================================================================
// Union Types for Request/Response Routing
// ============================================================================

export type McpRequest =
  | McpInitializeRequest
  | McpToolsListRequest
  | McpToolsCallRequest;

export type McpMethod = 'initialize' | 'tools/list' | 'tools/call';

export interface McpBaseRequest {
  jsonrpc: '2.0';
  id: string | number | null;  // null for JSON-RPC notifications (fire-and-forget)
  method: string;
  params?: unknown;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result: {
    content: Array<{
      type: 'text';
      text: string;
    }>;
  };
}

export interface McpJsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };
}

/**
 * MCP Error Codes (JSON-RPC standard + custom)
 */
export enum McpErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  RATE_LIMIT = -32000,
  FORBIDDEN = -32002,
}

/**
 * Search result format returned by MCP endpoint
 */
export interface McpSearchResult {
  results: Array<{
    title: string;
    content: string;
    score: number;
    sourceUrl?: string;
  }>;
  totalCount: number;
}

/**
 * Validated search arguments from MCP request
 */
export interface McpSearchArguments {
  query: string;
  limit: number;
  tags: string[];
}
