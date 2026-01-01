import { BadRequestException } from '@nestjs/common';
import { McpErrorCode } from '../../types/mcp.types';

/**
 * MCP Request Exception
 *
 * Custom exception for MCP JSON-RPC errors that includes the specific error code.
 * This allows the exception filter to return the correct JSON-RPC error code.
 *
 * Use this exception for:
 * - Invalid JSON-RPC structure (INVALID_REQUEST: -32600)
 * - Invalid parameters (INVALID_PARAMS: -32602)
 * - Method not found (METHOD_NOT_FOUND: -32601)
 */
export class McpRequestException extends BadRequestException {
  constructor(
    message: string,
    public readonly errorCode: McpErrorCode,
    public readonly errorData?: Record<string, unknown>,
  ) {
    super({
      message,
      errorCode,
      data: errorData,
    });
  }
}
