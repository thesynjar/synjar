-- Fix INSERT policies: use current_setting directly instead of function
-- The function may be evaluated in a different context

-- Drop old INSERT policies
DROP POLICY IF EXISTS workspace_insert ON "Workspace";
DROP POLICY IF EXISTS member_insert ON "WorkspaceMember";
DROP POLICY IF EXISTS document_insert ON "Document";
DROP POLICY IF EXISTS chunk_insert ON "Chunk";
DROP POLICY IF EXISTS tag_insert ON "DocumentTag";
DROP POLICY IF EXISTS link_insert ON "PublicLink";

-- Drop helper function (we'll use direct current_setting instead)
DROP FUNCTION IF EXISTS is_system_context();

-- Recreate INSERT policies with direct current_setting check
CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  WITH CHECK (current_setting('app.current_user_id', true) = 'SYSTEM');

CREATE POLICY member_insert ON "WorkspaceMember"
  FOR INSERT
  WITH CHECK (
    current_setting('app.current_user_id', true) = 'SYSTEM'
    OR "workspaceId" IN (SELECT * FROM get_user_workspace_ids())
  );

CREATE POLICY document_insert ON "Document"
  FOR INSERT
  WITH CHECK (
    current_setting('app.current_user_id', true) = 'SYSTEM'
    OR "workspaceId" IN (SELECT * FROM get_user_workspace_ids())
  );

CREATE POLICY chunk_insert ON "Chunk"
  FOR INSERT
  WITH CHECK (
    current_setting('app.current_user_id', true) = 'SYSTEM'
    OR "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

CREATE POLICY tag_insert ON "DocumentTag"
  FOR INSERT
  WITH CHECK (
    current_setting('app.current_user_id', true) = 'SYSTEM'
    OR "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

CREATE POLICY link_insert ON "PublicLink"
  FOR INSERT
  WITH CHECK (
    current_setting('app.current_user_id', true) = 'SYSTEM'
    OR "workspaceId" IN (SELECT * FROM get_user_workspace_ids())
  );
