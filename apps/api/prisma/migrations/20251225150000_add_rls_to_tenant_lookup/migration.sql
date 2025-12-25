-- Add Row Level Security policies for TenantUserEmailLookup table
-- This ensures workspace isolation for tenant-user email lookup entries

-- ============ ENABLE RLS ============

-- Enable RLS on TenantUserEmailLookup table
ALTER TABLE "TenantUserEmailLookup" ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner (prevents superuser bypass)
ALTER TABLE "TenantUserEmailLookup" FORCE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- SELECT: Users can only see lookup entries from their workspaces
CREATE POLICY tenant_lookup_select ON "TenantUserEmailLookup"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

-- INSERT: Users can only insert lookup entries into their workspaces
CREATE POLICY tenant_lookup_insert ON "TenantUserEmailLookup"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

-- UPDATE: Users can only update lookup entries from their workspaces
CREATE POLICY tenant_lookup_update ON "TenantUserEmailLookup"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()))
  WITH CHECK ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

-- DELETE: Users can only delete lookup entries from their workspaces
CREATE POLICY tenant_lookup_delete ON "TenantUserEmailLookup"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));
