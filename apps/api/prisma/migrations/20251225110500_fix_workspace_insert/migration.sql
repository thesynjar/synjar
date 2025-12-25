-- Fix Workspace INSERT policy: Allow any authenticated user to create workspace
-- Security is enforced at application level by JwtAuthGuard
-- New workspace doesn't exist in get_user_workspace_ids() yet, so we need special handling

-- Drop old INSERT policy
DROP POLICY IF EXISTS workspace_insert ON "Workspace";

-- Create new INSERT policy that allows:
-- 1. SYSTEM context (for tests/migrations)
-- 2. Any non-empty user context (authenticated users via JWT)
CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  WITH CHECK (
    current_setting('app.current_user_id', true) IS NOT NULL
    AND current_setting('app.current_user_id', true) != ''
  );
