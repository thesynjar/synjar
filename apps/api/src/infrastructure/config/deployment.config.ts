/**
 * Deployment Configuration Utility (Community Edition)
 *
 * Detects deployment mode (Cloud vs Self-hosted) and environment configuration.
 *
 * **IMPORTANT - Package Boundaries:**
 * Community edition does NOT know about enterprise features (Stripe, billing).
 * Enterprise packages can extend this with their own validators.
 *
 * Detection priority:
 * 1. Explicit DEPLOYMENT_MODE env var (required in community)
 * 2. Default: self-hosted
 *
 * **Cache behavior:**
 * - Mode is cached after first detection for performance
 * - Cache is never invalidated at runtime (env vars are immutable in production)
 * - In production: containers restart on config change (new cache)
 * - In testing: use `resetCache()` to clear cache between tests
 *
 * @see docs/specifications/2025-12-26-dual-mode-registration.md
 * @see docs/adr/2025-12-26-deployment-mode-detection.md
 * @see docs/ecosystem.md - Package boundaries and separation of concerns
 */
export class DeploymentConfig {
  /** Cached deployment mode (null until first detection) */
  private static cachedMode: 'cloud' | 'self-hosted' | null = null;

  /**
   * Get current deployment mode
   *
   * Community edition: reads DEPLOYMENT_MODE env var
   * Enterprise packages can override/extend with additional validation
   */
  static getMode(): 'cloud' | 'self-hosted' {
    if (this.cachedMode) {
      return this.cachedMode;
    }

    const explicitMode = process.env.DEPLOYMENT_MODE;

    // 1. Explicit mode (required in community)
    if (explicitMode === 'cloud' || explicitMode === 'self-hosted') {
      this.cachedMode = explicitMode;
      return explicitMode;
    }

    // 2. Default to self-hosted (community default)
    this.cachedMode = 'self-hosted';
    return 'self-hosted';
  }

  /**
   * Check if running in Cloud (SaaS) mode
   */
  static isCloud(): boolean {
    return this.getMode() === 'cloud';
  }

  /**
   * Check if running in Self-hosted mode
   */
  static isSelfHosted(): boolean {
    return this.getMode() === 'self-hosted';
  }

  /**
   * Check if email (SMTP) is configured
   */
  static isEmailConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST);
  }

  /**
   * Reset cached mode (useful for testing)
   * @internal
   */
  static resetCache(): void {
    this.cachedMode = null;
  }
}
