-- Fix Workspace RLS policies to support INSERT with createdById
-- This follows the same pattern as core-platform's tenant_isolation policy

-- ============ HELPER FUNCTION ============

-- Function to get current user ID (returns TEXT for comparison)
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$;

-- ============ DROP ALL EXISTING WORKSPACE POLICIES ============

DROP POLICY IF EXISTS workspace_select ON "Workspace";
DROP POLICY IF EXISTS workspace_insert ON "Workspace";
DROP POLICY IF EXISTS workspace_update ON "Workspace";
DROP POLICY IF EXISTS workspace_delete ON "Workspace";
DROP POLICY IF EXISTS workspace_insert_allow ON "Workspace";
DROP POLICY IF EXISTS workspace_all_allow ON "Workspace";

-- ============ NEW WORKSPACE POLICIES ============

-- SELECT: Can see workspaces where you're a member OR you created it
CREATE POLICY workspace_select ON "Workspace"
  FOR SELECT
  TO PUBLIC
  USING (
    id IN (SELECT * FROM get_user_workspace_ids())
    OR "createdById" = get_current_user_id()
  );

-- INSERT: Can only create workspace with your own ID as createdById
CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("createdById" = get_current_user_id());

-- UPDATE: Can only update workspaces where you're a member
CREATE POLICY workspace_update ON "Workspace"
  FOR UPDATE
  TO PUBLIC
  USING (id IN (SELECT * FROM get_user_workspace_ids()))
  WITH CHECK (id IN (SELECT * FROM get_user_workspace_ids()));

-- DELETE: Can only delete workspaces where you're a member
CREATE POLICY workspace_delete ON "Workspace"
  FOR DELETE
  TO PUBLIC
  USING (id IN (SELECT * FROM get_user_workspace_ids()));
