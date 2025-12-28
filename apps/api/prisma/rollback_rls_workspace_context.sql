-- ROLLBACK: RLS Per-Workspace Refactor
-- Restores user-based RLS policies from SPEC-001
-- Run manually with: psql $DATABASE_URL -f prisma/rollback_rls_workspace_context.sql

BEGIN;

-- ============ STEP 1: Drop new policies ============

-- Workspace policies
DROP POLICY IF EXISTS workspace_select ON "Workspace";
DROP POLICY IF EXISTS workspace_insert ON "Workspace";
DROP POLICY IF EXISTS workspace_update ON "Workspace";
DROP POLICY IF EXISTS workspace_delete ON "Workspace";

-- WorkspaceMember policies
DROP POLICY IF EXISTS member_select ON "WorkspaceMember";
DROP POLICY IF EXISTS member_insert ON "WorkspaceMember";
DROP POLICY IF EXISTS member_delete ON "WorkspaceMember";

-- Document policies
DROP POLICY IF EXISTS document_select ON "Document";
DROP POLICY IF EXISTS document_insert ON "Document";
DROP POLICY IF EXISTS document_update ON "Document";
DROP POLICY IF EXISTS document_delete ON "Document";

-- Chunk policies
DROP POLICY IF EXISTS chunk_select ON "Chunk";
DROP POLICY IF EXISTS chunk_insert ON "Chunk";
DROP POLICY IF EXISTS chunk_delete ON "Chunk";

-- DocumentTag policies
DROP POLICY IF EXISTS documenttag_select ON "DocumentTag";
DROP POLICY IF EXISTS documenttag_insert ON "DocumentTag";
DROP POLICY IF EXISTS documenttag_delete ON "DocumentTag";

-- PublicLink policies
DROP POLICY IF EXISTS publiclink_select ON "PublicLink";
DROP POLICY IF EXISTS publiclink_insert ON "PublicLink";
DROP POLICY IF EXISTS publiclink_update ON "PublicLink";
DROP POLICY IF EXISTS publiclink_delete ON "PublicLink";

-- Invitation policies
DROP POLICY IF EXISTS invitation_select ON "Invitation";
DROP POLICY IF EXISTS invitation_insert ON "Invitation";
DROP POLICY IF EXISTS invitation_update ON "Invitation";
DROP POLICY IF EXISTS invitation_delete ON "Invitation";

-- ============ STEP 2: Drop new helper function ============

DROP FUNCTION IF EXISTS get_current_workspace_id();

-- ============ STEP 3: Recreate original user-based function ============

CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF TEXT AS $$
DECLARE
  user_id_text TEXT;
BEGIN
  user_id_text := current_setting('app.current_user_id', true);
  IF user_id_text IS NULL OR user_id_text = '' THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT wm."workspaceId"
  FROM "WorkspaceMember" wm
  WHERE wm."userId" = user_id_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_workspace_ids() TO PUBLIC;

-- ============ STEP 4: Recreate original user-based policies ============

-- Workspace
CREATE POLICY workspace_isolation ON "Workspace"
  FOR ALL
  USING (id IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY workspace_select ON "Workspace"
  FOR SELECT
  TO PUBLIC
  USING (
    id IN (SELECT * FROM get_user_workspace_ids())
    OR "createdById" = get_current_user_id()
  );

CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("createdById" = get_current_user_id());

CREATE POLICY workspace_update ON "Workspace"
  FOR UPDATE
  TO PUBLIC
  USING (id IN (SELECT * FROM get_user_workspace_ids()))
  WITH CHECK (id IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY workspace_delete ON "Workspace"
  FOR DELETE
  TO PUBLIC
  USING (id IN (SELECT * FROM get_user_workspace_ids()));

-- WorkspaceMember
CREATE POLICY member_isolation ON "WorkspaceMember"
  FOR ALL
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

-- Document
CREATE POLICY document_isolation ON "Document"
  FOR ALL
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

-- Chunk
CREATE POLICY chunk_isolation ON "Chunk"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

-- DocumentTag
CREATE POLICY tag_isolation ON "DocumentTag"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

-- PublicLink
CREATE POLICY public_link_isolation ON "PublicLink"
  FOR ALL
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

-- ============ STEP 5: Re-enable RLS on WorkspaceProcessingQueue ============

ALTER TABLE "WorkspaceProcessingQueue" ENABLE ROW LEVEL SECURITY;

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'RLS rollback completed - restored user-based policies';
END $$;

COMMIT;
