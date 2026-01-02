-- Fix Workspace SELECT RLS Policy - Circular Dependency Issue
--
-- PROBLEM:
-- The workspace_select policy has a subquery that accesses WorkspaceMember:
--   id IN (SELECT wm."workspaceId" FROM "WorkspaceMember" wm WHERE wm."userId" = get_current_user_id())
--
-- This subquery is subject to WorkspaceMember's RLS policies (member_select),
-- which creates a circular dependency during policy evaluation.
--
-- When checking workspace_select policy:
-- 1. Postgres evaluates: id IN (SELECT wm."workspaceId" FROM "WorkspaceMember" wm ...)
-- 2. This triggers member_select policy on WorkspaceMember
-- 3. member_select requires: "workspaceId" = get_current_workspace_id() OR "userId" = get_current_user_id()
-- 4. But we're IN THE MIDDLE of evaluating workspace policies, so Postgres may not properly evaluate the subquery
--
-- SOLUTION:
-- Create a SECURITY DEFINER function that bypasses RLS when querying WorkspaceMember.
-- This is safe because:
-- 1. Function only returns workspace IDs for a given user (no data leak)
-- 2. Function is called WITHIN an RLS policy (double security layer)
-- 3. Same pattern used in previous migrations (get_user_workspace_ids before refactor)

-- ============ STEP 1: Create helper function with SECURITY DEFINER ============

CREATE OR REPLACE FUNCTION get_user_workspace_ids_for_select()
RETURNS SETOF TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_id_text TEXT;
BEGIN
  -- Get current user ID from session variable
  user_id_text := NULLIF(current_setting('app.current_user_id', true), '');

  -- If no user context set, return empty set (no workspaces visible)
  IF user_id_text IS NULL THEN
    RETURN;
  END IF;

  -- Return workspace IDs where user is a member
  -- SECURITY DEFINER bypasses RLS on WorkspaceMember table
  RETURN QUERY
    SELECT wm."workspaceId"
    FROM "WorkspaceMember" wm
    WHERE wm."userId" = user_id_text;
END;
$$;

-- ============ STEP 2: Update workspace_select policy ============

-- Drop existing policy
DROP POLICY IF EXISTS workspace_select ON "Workspace";

-- Recreate with SECURITY DEFINER function
CREATE POLICY workspace_select ON "Workspace"
  FOR SELECT
  TO PUBLIC
  USING (
    -- Allow if workspace context is set (for single workspace operations)
    id = get_current_workspace_id()
    -- OR if user is a member (for list operations like GET /workspaces)
    OR id IN (SELECT * FROM get_user_workspace_ids_for_select())
  );

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'Fixed workspace_select RLS policy with SECURITY DEFINER function';
  RAISE NOTICE 'This resolves circular dependency when querying WorkspaceMember from workspace policy';
END $$;
