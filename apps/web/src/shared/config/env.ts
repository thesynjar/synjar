/**
 * Runtime environment configuration
 *
 * Priority order:
 * 1. window.__ENV__ (runtime config from Docker entrypoint)
 * 2. import.meta.env (Vite build-time config)
 * 3. Default value
 */

declare global {
  interface Window {
    __ENV__?: {
      VITE_API_URL?: string;
      VITE_DOCS_URL?: string;
      VITE_ENABLE_ANALYTICS?: string;
      VITE_ENABLE_AUDIT_LOG?: string;
      VITE_ENABLE_TENANT_ADMIN?: string;
    };
  }
}

function getEnv(key: string, defaultValue = ''): string {
  // Runtime config (Docker)
  const runtimeValue = window.__ENV__?.[key as keyof typeof window.__ENV__];
  if (runtimeValue) {
    return runtimeValue;
  }

  // Build-time config (Vite)
  const buildValue = import.meta.env[key];
  if (buildValue) {
    return buildValue;
  }

  return defaultValue;
}

export const config = {
  apiUrl: getEnv('VITE_API_URL', ''),
  docsUrl: getEnv('VITE_DOCS_URL', 'https://docs.synjar.com'),
  enableAnalytics: getEnv('VITE_ENABLE_ANALYTICS', 'false') === 'true',
  enableAuditLog: getEnv('VITE_ENABLE_AUDIT_LOG', 'false') === 'true',
  enableTenantAdmin: getEnv('VITE_ENABLE_TENANT_ADMIN', 'false') === 'true',
} as const;
