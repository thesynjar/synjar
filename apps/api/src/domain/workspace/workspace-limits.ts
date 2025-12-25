export interface WorkspaceLimits {
  maxStorageBytes: number;
  maxDocuments: number;
  maxFileSizeBytes: number;
}

// Default values - will be overridden by env in service
export const DEFAULT_WORKSPACE_LIMITS: WorkspaceLimits = {
  maxStorageBytes: 1 * 1024 * 1024 * 1024, // 1 GB
  maxDocuments: 1000,
  maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
};
