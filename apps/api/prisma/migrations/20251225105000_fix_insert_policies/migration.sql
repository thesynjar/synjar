-- Fix INSERT policies: Add WITH CHECK for write operations
-- Problem: FOR ALL USING(...) doesn't allow INSERT of new rows
-- Solution: Split into SELECT and write policies with proper WITH CHECK

-- Drop existing policies
DROP POLICY IF EXISTS workspace_isolation ON "Workspace";
DROP POLICY IF EXISTS member_isolation ON "WorkspaceMember";
DROP POLICY IF EXISTS document_isolation ON "Document";
DROP POLICY IF EXISTS chunk_isolation ON "Chunk";
DROP POLICY IF EXISTS tag_isolation ON "DocumentTag";
DROP POLICY IF EXISTS public_link_isolation ON "PublicLink";

-- Helper function to check if we're in SYSTEM mode
CREATE OR REPLACE FUNCTION is_system_context()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_setting('app.current_user_id', true) = 'SYSTEM';
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION is_system_context() TO PUBLIC;

-- ============ WORKSPACE POLICIES ============

-- SELECT: user sees their workspaces
CREATE POLICY workspace_select ON "Workspace"
  FOR SELECT
  USING (id IN (SELECT * FROM get_user_workspace_ids()));

-- INSERT: only SYSTEM can create workspaces directly (normal users go through service layer)
CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  WITH CHECK (is_system_context());

-- UPDATE: user can update their workspaces
CREATE POLICY workspace_update ON "Workspace"
  FOR UPDATE
  USING (id IN (SELECT * FROM get_user_workspace_ids()))
  WITH CHECK (id IN (SELECT * FROM get_user_workspace_ids()));

-- DELETE: user can delete their workspaces
CREATE POLICY workspace_delete ON "Workspace"
  FOR DELETE
  USING (id IN (SELECT * FROM get_user_workspace_ids()));

-- ============ WORKSPACE MEMBER POLICIES ============

CREATE POLICY member_select ON "WorkspaceMember"
  FOR SELECT
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY member_insert ON "WorkspaceMember"
  FOR INSERT
  WITH CHECK (is_system_context() OR "workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY member_update ON "WorkspaceMember"
  FOR UPDATE
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()))
  WITH CHECK ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY member_delete ON "WorkspaceMember"
  FOR DELETE
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

-- ============ DOCUMENT POLICIES ============

CREATE POLICY document_select ON "Document"
  FOR SELECT
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY document_insert ON "Document"
  FOR INSERT
  WITH CHECK (is_system_context() OR "workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY document_update ON "Document"
  FOR UPDATE
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()))
  WITH CHECK ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY document_delete ON "Document"
  FOR DELETE
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

-- ============ CHUNK POLICIES ============

CREATE POLICY chunk_select ON "Chunk"
  FOR SELECT
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

CREATE POLICY chunk_insert ON "Chunk"
  FOR INSERT
  WITH CHECK (
    is_system_context() OR
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

CREATE POLICY chunk_update ON "Chunk"
  FOR UPDATE
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

CREATE POLICY chunk_delete ON "Chunk"
  FOR DELETE
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

-- ============ DOCUMENT TAG POLICIES ============

CREATE POLICY tag_select ON "DocumentTag"
  FOR SELECT
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

CREATE POLICY tag_insert ON "DocumentTag"
  FOR INSERT
  WITH CHECK (
    is_system_context() OR
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

CREATE POLICY tag_delete ON "DocumentTag"
  FOR DELETE
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

-- ============ PUBLIC LINK POLICIES ============

CREATE POLICY link_select ON "PublicLink"
  FOR SELECT
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY link_insert ON "PublicLink"
  FOR INSERT
  WITH CHECK (is_system_context() OR "workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY link_update ON "PublicLink"
  FOR UPDATE
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()))
  WITH CHECK ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY link_delete ON "PublicLink"
  FOR DELETE
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));
