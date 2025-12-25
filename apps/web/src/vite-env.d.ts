/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ENABLE_ANALYTICS: string;
  readonly VITE_ENABLE_AUDIT_LOG: string;
  readonly VITE_ENABLE_TENANT_ADMIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
