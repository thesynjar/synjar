-- Remove RLS from TenantUserEmailLookup
-- This table is used for workspace resolution BEFORE user context is set
-- It needs to be accessible without RLS to answer: "which workspaces belong to this email?"

-- Drop all policies
DROP POLICY IF EXISTS tenant_lookup_select ON "TenantUserEmailLookup";
DROP POLICY IF EXISTS tenant_lookup_insert ON "TenantUserEmailLookup";
DROP POLICY IF EXISTS tenant_lookup_update ON "TenantUserEmailLookup";
DROP POLICY IF EXISTS tenant_lookup_delete ON "TenantUserEmailLookup";

-- Disable RLS on this table
ALTER TABLE "TenantUserEmailLookup" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantUserEmailLookup" NO FORCE ROW LEVEL SECURITY;

-- Note: Security for this table is handled at application layer:
-- 1. Only authenticated users can trigger workspace member events
-- 2. Email hashes are one-way (cannot reverse to email)
-- 3. Endpoint /api/v1/auth/resolve-workspaces validates email ownership
