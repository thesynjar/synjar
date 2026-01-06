import * as crypto from 'crypto';
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { McpErrorCode, McpJsonRpcErrorResponse } from '../../types/mcp.types';
import { McpRequestException } from './mcp-request.exception';

/**
 * MCP Exception Filter
 *
 * Converts NestJS exceptions to JSON-RPC error responses per MCP spec.
 *
 * Error Code Mapping:
 * - McpRequestException → Custom error code (from exception)
 * - BadRequestException → -32602 (Invalid params)
 * - ForbiddenException → -32002 (Forbidden)
 * - ThrottlerException → -32000 (Rate limit)
 * - Other → -32603 (Internal error)
 */
@Catch()
export class McpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(McpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let httpStatus = 500;
    let errorCode = McpErrorCode.INTERNAL_ERROR;
    let message = 'Internal error';
    let data: Record<string, unknown> | undefined;

    // Check for custom MCP exception first (before generic BadRequestException)
    if (exception instanceof McpRequestException) {
      httpStatus = 400;
      errorCode = exception.errorCode;
      message = exception.message;
      if (exception.errorData) {
        data = exception.errorData;
      }
    } else if (exception instanceof BadRequestException) {
      httpStatus = 400;
      errorCode = McpErrorCode.INVALID_PARAMS;
      message = exception.message;
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && 'data' in exceptionResponse) {
        data = (exceptionResponse as any).data;
      }
    } else if (exception instanceof ForbiddenException) {
      httpStatus = 403;
      errorCode = McpErrorCode.FORBIDDEN;
      message = exception.message || 'Invalid or expired token';
    } else if (exception instanceof ThrottlerException) {
      httpStatus = 429;
      errorCode = McpErrorCode.RATE_LIMIT;
      message = 'Rate limit exceeded (30 requests/minute)';
      // Extract retry-after if available
      const retryAfter = (exception as any).retryAfter;
      if (retryAfter) {
        data = { retryAfter };
      }
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      message = exception.message;
    } else {
      // Unexpected error - log for debugging
      this.logger.error('Unexpected MCP error', exception);
    }

    const errorResponse: McpJsonRpcErrorResponse = {
      jsonrpc: '2.0',
      id: (request.body as any)?.id ?? null,
      error: {
        code: errorCode,
        message,
        ...(data && { data }),
      },
    };

    // Return SSE format for ChatGPT compatibility
    // Format: event: message\nid: <uuid>\ndata: <json>\n\n
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.status(httpStatus);
    const eventId = crypto.randomUUID();
    response.write(`event: message\n`);
    response.write(`id: ${eventId}\n`);
    response.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
    response.end();
  }
}
