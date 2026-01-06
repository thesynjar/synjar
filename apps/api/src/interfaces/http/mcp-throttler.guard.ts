import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(McpThrottlerGuard.name);

  /**
   * Generate tracker key from token parameter.
   *
   * Throws error if token is not available (indicates misconfigured route).
   */
  protected async getTracker(req: Request): Promise<string> {
    // Extract token from route params (e.g., /mcp/:token)
    const token = req.params?.token;

    if (!token || typeof token !== 'string') {
      this.logger.error({
        event: 'MCP_THROTTLER_MISSING_TOKEN',
        route: req.route?.path,
        method: req.method,
      });
      throw new Error('Token parameter missing in MCP route');
    }

    return `mcp:${token}`;
  }
}
