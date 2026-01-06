import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * MCP-specific throttler guard that uses token as the tracking key.
 *
 * This ensures rate limiting is applied per-token rather than per-IP,
 * which is more appropriate for MCP endpoints where:
 * - Different tokens may have different usage patterns
 * - Multiple users may share the same IP (corporate networks)
 * - A single user may use multiple tokens
 */
@Injectable()
export class McpThrottlerGuard extends ThrottlerGuard {
  /**
   * Generate tracker key from token parameter.
   *
   * Falls back to IP if token is not available (shouldn't happen
   * for valid MCP routes, but provides a safe default).
   */
  protected async getTracker(req: Request): Promise<string> {
    // Extract token from route params (e.g., /mcp/:token)
    const token = req.params?.token;

    if (token && typeof token === 'string') {
      return `mcp:${token}`;
    }

    // Fallback to IP (shouldn't happen for valid MCP requests)
    return `mcp:ip:${req.ip}`;
  }
}
