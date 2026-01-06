import * as crypto from 'crypto';
import { Response } from 'express';

/**
 * SSE event type for MCP JSON-RPC responses.
 * Required by ChatGPT and other MCP clients.
 */
export const SSE_EVENT_TYPE = 'message';

/**
 * Utility class for sending SSE responses in MCP format.
 *
 * SSE Format: event: message\nid: <uuid>\ndata: <json>\n\n
 *
 * @see https://spec.modelcontextprotocol.io/specification/
 */
export class McpSseFormatter {
  /**
   * Set required SSE headers on response.
   */
  static setHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  /**
   * Send SSE event with proper format.
   *
   * @param res Express response object
   * @param data JSON data to send
   * @param httpStatus HTTP status code (default 200)
   */
  static sendEvent(res: Response, data: unknown, httpStatus: number = 200): void {
    this.setHeaders(res);
    res.status(httpStatus);
    const eventId = crypto.randomUUID();
    res.write(`event: ${SSE_EVENT_TYPE}\n`);
    res.write(`id: ${eventId}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.end();
  }
}
