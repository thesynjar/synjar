/**
 * MCP (Model Context Protocol) JSON-RPC Types
 *
 * Specification: https://spec.modelcontextprotocol.io/specification/draft/architecture/
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
