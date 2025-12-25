-- Fix RLS function: use TEXT instead of UUID for column comparison
-- Columns userId and workspaceId are TEXT type in Prisma schema

-- First drop policies that depend on the function
DROP POLICY IF EXISTS workspace_isolation ON "Workspace";
DROP POLICY IF EXISTS member_isolation ON "WorkspaceMember";
DROP POLICY IF EXISTS document_isolation ON "Document";
DROP POLICY IF EXISTS chunk_isolation ON "Chunk";
DROP POLICY IF EXISTS tag_isolation ON "DocumentTag";
DROP POLICY IF EXISTS public_link_isolation ON "PublicLink";

-- Now drop the function
DROP FUNCTION IF EXISTS get_user_workspace_ids();

-- Recreate with correct types (TEXT comparison)
CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF TEXT AS $$
DECLARE
  user_id_text TEXT;
BEGIN
  -- Get the current user ID setting
  user_id_text := current_setting('app.current_user_id', true);

  -- Return empty set if no user context is set
  IF user_id_text IS NULL OR user_id_text = '' THEN
    RETURN;
  END IF;

  -- Return workspace IDs where user is a member
  -- Use SECURITY DEFINER to bypass RLS on WorkspaceMember table
  RETURN QUERY
  SELECT wm."workspaceId"
  FROM "WorkspaceMember" wm
  WHERE wm."userId" = user_id_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_workspace_ids() TO PUBLIC;

-- Update policies to use TEXT comparison (drop and recreate)

-- Drop existing policies
DROP POLICY IF EXISTS workspace_isolation ON "Workspace";
DROP POLICY IF EXISTS member_isolation ON "WorkspaceMember";
DROP POLICY IF EXISTS document_isolation ON "Document";
DROP POLICY IF EXISTS chunk_isolation ON "Chunk";
DROP POLICY IF EXISTS tag_isolation ON "DocumentTag";
DROP POLICY IF EXISTS public_link_isolation ON "PublicLink";

-- Recreate policies with TEXT comparison
CREATE POLICY workspace_isolation ON "Workspace"
  FOR ALL
  USING (id IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY member_isolation ON "WorkspaceMember"
  FOR ALL
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY document_isolation ON "Document"
  FOR ALL
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));

CREATE POLICY chunk_isolation ON "Chunk"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

CREATE POLICY tag_isolation ON "DocumentTag"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

CREATE POLICY public_link_isolation ON "PublicLink"
  FOR ALL
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));
