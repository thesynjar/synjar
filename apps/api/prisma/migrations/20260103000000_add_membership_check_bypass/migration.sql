-- Add SECURITY DEFINER function for membership verification
--
-- PROBLEM:
-- The RLS middleware's verifyMembership method queries WorkspaceMember table
-- with a raw SQL query. But this query is subject to RLS policies which require
-- either workspace or user context to be set.
--
-- This creates a chicken-and-egg problem:
-- 1. Middleware needs to verify membership BEFORE setting context
-- 2. But membership check needs context to work
-- 3. Query returns 0 results → User gets 403 Forbidden
--
-- SOLUTION:
-- Create a SECURITY DEFINER function that bypasses RLS when checking membership.
-- This is safe because:
-- 1. Function only returns a boolean (member or not) - no data leak
-- 2. Function is called by authenticated middleware (not public)
-- 3. Same pattern used for workspace SELECT policy fix

-- ============ STEP 1: Create membership check function ============

CREATE OR REPLACE FUNCTION check_workspace_membership(p_user_id TEXT, p_workspace_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Check if user is a member of the workspace
  -- SECURITY DEFINER bypasses RLS on WorkspaceMember table
  RETURN EXISTS (
    SELECT 1
    FROM "WorkspaceMember"
    WHERE "userId" = p_user_id
      AND "workspaceId" = p_workspace_id
  );
END;
$$;

-- Grant execute permission to synjar_app user
GRANT EXECUTE ON FUNCTION check_workspace_membership TO synjar_app;

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'Created check_workspace_membership SECURITY DEFINER function';
  RAISE NOTICE 'This resolves RLS circular dependency in membership verification';
END $$;
