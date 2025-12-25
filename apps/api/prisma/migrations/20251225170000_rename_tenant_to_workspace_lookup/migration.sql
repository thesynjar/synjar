-- Rename TenantUserEmailLookup to UserWorkspaceLookup
-- This table maps email hashes to workspaces, used for workspace resolution before auth context

-- Rename the table
ALTER TABLE "TenantUserEmailLookup" RENAME TO "UserWorkspaceLookup";

-- Rename the primary key constraint
ALTER INDEX "TenantUserEmailLookup_pkey" RENAME TO "UserWorkspaceLookup_pkey";

-- Rename the unique constraint
ALTER INDEX "TenantUserEmailLookup_emailHash_workspaceId_key" RENAME TO "UserWorkspaceLookup_emailHash_workspaceId_key";

-- Rename the indexes
ALTER INDEX "TenantUserEmailLookup_emailHash_idx" RENAME TO "UserWorkspaceLookup_emailHash_idx";
