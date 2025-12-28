-- RLS Per-Workspace Refactor
-- Changes RLS from user-based to workspace-based context
-- ATOMIC: Prisma wraps migrations in a transaction automatically

-- ============ STEP 1: Drop old policies ============

-- Workspace policies
DROP POLICY IF EXISTS workspace_isolation ON "Workspace";
DROP POLICY IF EXISTS workspace_select ON "Workspace";
DROP POLICY IF EXISTS workspace_insert ON "Workspace";
DROP POLICY IF EXISTS workspace_update ON "Workspace";
DROP POLICY IF EXISTS workspace_delete ON "Workspace";

-- WorkspaceMember policies (including _update variant)
DROP POLICY IF EXISTS member_isolation ON "WorkspaceMember";
DROP POLICY IF EXISTS member_select ON "WorkspaceMember";
DROP POLICY IF EXISTS member_insert ON "WorkspaceMember";
DROP POLICY IF EXISTS member_update ON "WorkspaceMember";
DROP POLICY IF EXISTS member_delete ON "WorkspaceMember";

-- Document policies
DROP POLICY IF EXISTS document_isolation ON "Document";
DROP POLICY IF EXISTS document_select ON "Document";
DROP POLICY IF EXISTS document_insert ON "Document";
DROP POLICY IF EXISTS document_update ON "Document";
DROP POLICY IF EXISTS document_delete ON "Document";

-- Chunk policies (including _update variant)
DROP POLICY IF EXISTS chunk_isolation ON "Chunk";
DROP POLICY IF EXISTS chunk_select ON "Chunk";
DROP POLICY IF EXISTS chunk_insert ON "Chunk";
DROP POLICY IF EXISTS chunk_update ON "Chunk";
DROP POLICY IF EXISTS chunk_delete ON "Chunk";

-- DocumentTag policies (including variants)
DROP POLICY IF EXISTS tag_isolation ON "DocumentTag";
DROP POLICY IF EXISTS tag_select ON "DocumentTag";
DROP POLICY IF EXISTS tag_insert ON "DocumentTag";
DROP POLICY IF EXISTS tag_update ON "DocumentTag";
DROP POLICY IF EXISTS tag_delete ON "DocumentTag";
DROP POLICY IF EXISTS documenttag_select ON "DocumentTag";
DROP POLICY IF EXISTS documenttag_insert ON "DocumentTag";
DROP POLICY IF EXISTS documenttag_update ON "DocumentTag";
DROP POLICY IF EXISTS documenttag_delete ON "DocumentTag";

-- PublicLink policies (including variants)
DROP POLICY IF EXISTS public_link_isolation ON "PublicLink";
DROP POLICY IF EXISTS link_select ON "PublicLink";
DROP POLICY IF EXISTS link_insert ON "PublicLink";
DROP POLICY IF EXISTS link_update ON "PublicLink";
DROP POLICY IF EXISTS link_delete ON "PublicLink";
DROP POLICY IF EXISTS publiclink_select ON "PublicLink";
DROP POLICY IF EXISTS publiclink_insert ON "PublicLink";
DROP POLICY IF EXISTS publiclink_update ON "PublicLink";
DROP POLICY IF EXISTS publiclink_delete ON "PublicLink";

-- Invitation policies (if existed)
DROP POLICY IF EXISTS invitation_isolation ON "Invitation";
DROP POLICY IF EXISTS invitation_select ON "Invitation";
DROP POLICY IF EXISTS invitation_insert ON "Invitation";
DROP POLICY IF EXISTS invitation_update ON "Invitation";
DROP POLICY IF EXISTS invitation_delete ON "Invitation";

-- ============ STEP 2: Drop old function ============

DROP FUNCTION IF EXISTS get_user_workspace_ids();

-- Note: Keep get_current_user_id() as it's used for workspace creation

-- ============ STEP 3: Enable RLS on Invitation (if not enabled) ============

ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;

-- ============ STEP 4: Create new workspace-based policies ============

-- Helper: Get current workspace ID (with null check)
CREATE OR REPLACE FUNCTION get_current_workspace_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_workspace_id', true), '');
$$;

-- ============ Workspace policies ============

-- SELECT: workspace context OR user context (for list endpoints like GET /workspaces)
CREATE POLICY workspace_select ON "Workspace"
  FOR SELECT
  TO PUBLIC
  USING (
    id = get_current_workspace_id()
    OR id IN (
      SELECT wm."workspaceId"
      FROM "WorkspaceMember" wm
      WHERE wm."userId" = get_current_user_id()
    )
  );

-- INSERT: user context (for creating new workspace)
CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("createdById" = get_current_user_id());

-- UPDATE: workspace context only
CREATE POLICY workspace_update ON "Workspace"
  FOR UPDATE
  TO PUBLIC
  USING (id = get_current_workspace_id())
  WITH CHECK (id = get_current_workspace_id());

-- DELETE: workspace context only
CREATE POLICY workspace_delete ON "Workspace"
  FOR DELETE
  TO PUBLIC
  USING (id = get_current_workspace_id());

-- ============ WorkspaceMember policies ============

-- SELECT: workspace context OR user context (for list endpoints)
CREATE POLICY member_select ON "WorkspaceMember"
  FOR SELECT
  TO PUBLIC
  USING (
    "workspaceId" = get_current_workspace_id()
    OR "userId" = get_current_user_id()
  );

-- INSERT: workspace context only
CREATE POLICY member_insert ON "WorkspaceMember"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

-- DELETE: workspace context only
CREATE POLICY member_delete ON "WorkspaceMember"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- ============ Document policies ============

-- SELECT: workspace context only
CREATE POLICY document_select ON "Document"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- INSERT: workspace context only
CREATE POLICY document_insert ON "Document"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

-- UPDATE: workspace context only
CREATE POLICY document_update ON "Document"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id())
  WITH CHECK ("workspaceId" = get_current_workspace_id());

-- DELETE: workspace context only
CREATE POLICY document_delete ON "Document"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- ============ Chunk policies (via Document) ============

-- SELECT: via document's workspace
CREATE POLICY chunk_select ON "Chunk"
  FOR SELECT
  TO PUBLIC
  USING (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

-- INSERT: via document's workspace
CREATE POLICY chunk_insert ON "Chunk"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

-- DELETE: via document's workspace
CREATE POLICY chunk_delete ON "Chunk"
  FOR DELETE
  TO PUBLIC
  USING (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

-- ============ DocumentTag policies (via Document) ============

-- SELECT: via document's workspace
CREATE POLICY documenttag_select ON "DocumentTag"
  FOR SELECT
  TO PUBLIC
  USING (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

-- INSERT: via document's workspace
CREATE POLICY documenttag_insert ON "DocumentTag"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

-- DELETE: via document's workspace
CREATE POLICY documenttag_delete ON "DocumentTag"
  FOR DELETE
  TO PUBLIC
  USING (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

-- ============ PublicLink policies ============

-- SELECT: workspace context only
CREATE POLICY publiclink_select ON "PublicLink"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- INSERT: workspace context only
CREATE POLICY publiclink_insert ON "PublicLink"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

-- UPDATE: workspace context only
CREATE POLICY publiclink_update ON "PublicLink"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id())
  WITH CHECK ("workspaceId" = get_current_workspace_id());

-- DELETE: workspace context only
CREATE POLICY publiclink_delete ON "PublicLink"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- ============ Invitation policies ============

-- SELECT: workspace context only
CREATE POLICY invitation_select ON "Invitation"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- INSERT: workspace context only
CREATE POLICY invitation_insert ON "Invitation"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

-- UPDATE: workspace context only
CREATE POLICY invitation_update ON "Invitation"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id())
  WITH CHECK ("workspaceId" = get_current_workspace_id());

-- DELETE: workspace context only
CREATE POLICY invitation_delete ON "Invitation"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- ============ STEP 5: WorkspaceProcessingQueue - NO RLS ============

-- System table - disable RLS (scheduler needs unrestricted access)
-- This table is NEVER exposed via API
ALTER TABLE "WorkspaceProcessingQueue" DISABLE ROW LEVEL SECURITY;

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'RLS workspace context migration completed successfully';
END $$;
