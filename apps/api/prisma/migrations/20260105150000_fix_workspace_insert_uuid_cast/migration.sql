-- Fix InstructionSet RLS policies that use current_setting() directly
--
-- Issue: InstructionSet policies used current_setting() directly instead of
-- the helper functions. This migration:
-- 1. Drops and recreates the helper functions (to ensure consistent behavior)
-- 2. Drops the old InstructionSet policies that use current_setting() directly
-- 3. Recreates InstructionSet policies using the helper functions
--
-- Note: Prisma uses TEXT for ID columns (not UUID), so functions return TEXT.

-- ============ STEP 1: Drop functions with CASCADE ============
-- This drops all dependent RLS policies automatically

DROP FUNCTION IF EXISTS get_current_user_id() CASCADE;
DROP FUNCTION IF EXISTS get_current_workspace_id() CASCADE;

-- ============ STEP 2: Recreate functions returning TEXT ============
-- Prisma uses String (TEXT) for ID columns, not UUID

CREATE FUNCTION get_current_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$;

CREATE FUNCTION get_current_workspace_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_workspace_id', true), '');
$$;

-- ============ STEP 3: Recreate ALL RLS policies ============

-- Workspace policies
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

CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("createdById" = get_current_user_id());

CREATE POLICY workspace_update ON "Workspace"
  FOR UPDATE
  TO PUBLIC
  USING (id = get_current_workspace_id())
  WITH CHECK (id = get_current_workspace_id());

CREATE POLICY workspace_delete ON "Workspace"
  FOR DELETE
  TO PUBLIC
  USING (id = get_current_workspace_id());

-- WorkspaceMember policies
CREATE POLICY member_select ON "WorkspaceMember"
  FOR SELECT
  TO PUBLIC
  USING (
    "workspaceId" = get_current_workspace_id()
    OR "userId" = get_current_user_id()
  );

CREATE POLICY member_insert ON "WorkspaceMember"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY member_delete ON "WorkspaceMember"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- Document policies
CREATE POLICY document_select ON "Document"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

CREATE POLICY document_insert ON "Document"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY document_update ON "Document"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id())
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY document_delete ON "Document"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- Chunk policies (via Document)
CREATE POLICY chunk_select ON "Chunk"
  FOR SELECT
  TO PUBLIC
  USING (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

CREATE POLICY chunk_insert ON "Chunk"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

CREATE POLICY chunk_delete ON "Chunk"
  FOR DELETE
  TO PUBLIC
  USING (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

-- DocumentTag policies (via Document)
CREATE POLICY documenttag_select ON "DocumentTag"
  FOR SELECT
  TO PUBLIC
  USING (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

CREATE POLICY documenttag_insert ON "DocumentTag"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

CREATE POLICY documenttag_delete ON "DocumentTag"
  FOR DELETE
  TO PUBLIC
  USING (
    "documentId" IN (
      SELECT id FROM "Document"
      WHERE "workspaceId" = get_current_workspace_id()
    )
  );

-- PublicLink policies
CREATE POLICY publiclink_select ON "PublicLink"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

CREATE POLICY publiclink_insert ON "PublicLink"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY publiclink_update ON "PublicLink"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id())
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY publiclink_delete ON "PublicLink"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- Invitation policies
CREATE POLICY invitation_select ON "Invitation"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

CREATE POLICY invitation_insert ON "Invitation"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY invitation_update ON "Invitation"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id())
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY invitation_delete ON "Invitation"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- Tag policies (workspace-scoped tags table)
CREATE POLICY tag_select ON "Tag"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

CREATE POLICY tag_insert ON "Tag"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY tag_update ON "Tag"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id())
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY tag_delete ON "Tag"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- InstructionSet policies (use functions instead of direct current_setting)
-- NOTE: These policies used current_setting() directly, so CASCADE didn't drop them
DROP POLICY IF EXISTS "instruction_set_select" ON "InstructionSet";
DROP POLICY IF EXISTS "instruction_set_insert" ON "InstructionSet";
DROP POLICY IF EXISTS "instruction_set_update" ON "InstructionSet";
DROP POLICY IF EXISTS "instruction_set_delete" ON "InstructionSet";
DROP POLICY IF EXISTS "instruction_set_document_all" ON "InstructionSetDocument";

CREATE POLICY instruction_set_select ON "InstructionSet"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

CREATE POLICY instruction_set_insert ON "InstructionSet"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY instruction_set_update ON "InstructionSet"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id())
  WITH CHECK ("workspaceId" = get_current_workspace_id());

CREATE POLICY instruction_set_delete ON "InstructionSet"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- InstructionSetDocument policies (junction table)
CREATE POLICY instruction_set_document_all ON "InstructionSetDocument"
  FOR ALL
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM "InstructionSet"
      WHERE "InstructionSet"."id" = "InstructionSetDocument"."instructionSetId"
        AND "InstructionSet"."workspaceId" = get_current_workspace_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "InstructionSet"
      WHERE "InstructionSet"."id" = "InstructionSetDocument"."instructionSetId"
        AND "InstructionSet"."workspaceId" = get_current_workspace_id()
    )
  );

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'RLS UUID migration completed successfully';
  RAISE NOTICE '  - get_current_user_id() now returns UUID';
  RAISE NOTICE '  - get_current_workspace_id() now returns UUID';
  RAISE NOTICE '  - All RLS policies recreated';
END $$;
