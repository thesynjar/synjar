-- Enable Row Level Security (RLS) on all workspace-related tables
-- This provides database-level isolation between workspaces

-- Enable RLS on tables
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Chunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicLink" ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner (prevents superuser bypass)
ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Chunk" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTag" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PublicLink" FORCE ROW LEVEL SECURITY;

-- Helper function: get current user's workspace IDs
-- This function is SECURITY DEFINER to ensure it can read WorkspaceMember
-- regardless of RLS policies on that table
-- SECURITY DEFINER makes it run with the privileges of the function owner (bypassing RLS)
CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF UUID AS $$
DECLARE
  user_id_text TEXT;
  user_id_uuid UUID;
BEGIN
  -- Get the current user ID setting
  user_id_text := current_setting('app.current_user_id', true);

  -- Return empty set if no user context is set
  IF user_id_text IS NULL OR user_id_text = '' THEN
    RETURN;
  END IF;

  -- Convert text to UUID
  user_id_uuid := user_id_text::UUID;

  -- Use SECURITY DEFINER to bypass RLS on WorkspaceMember table
  RETURN QUERY
  SELECT wm."workspaceId"::UUID
  FROM "WorkspaceMember" wm
  WHERE wm."userId" = user_id_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Policy: Workspace isolation
-- Users can only see workspaces they are members of
CREATE POLICY workspace_isolation ON "Workspace"
  FOR ALL
  USING (
    id IN (SELECT * FROM get_user_workspace_ids())
  );

-- Policy: WorkspaceMember isolation
-- Users can only see members of their own workspaces
CREATE POLICY member_isolation ON "WorkspaceMember"
  FOR ALL
  USING (
    "workspaceId" IN (SELECT * FROM get_user_workspace_ids())
  );

-- Policy: Document isolation
-- Users can only see documents from their workspaces
CREATE POLICY document_isolation ON "Document"
  FOR ALL
  USING (
    "workspaceId" IN (SELECT * FROM get_user_workspace_ids())
  );

-- Policy: Chunk isolation (through document)
-- Users can only see chunks from documents they have access to
CREATE POLICY chunk_isolation ON "Chunk"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

-- Policy: DocumentTag isolation (through document)
-- Users can only see document tags from documents they have access to
CREATE POLICY tag_isolation ON "DocumentTag"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    )
  );

-- Policy: PublicLink isolation
-- Users can only see public links from their workspaces
CREATE POLICY public_link_isolation ON "PublicLink"
  FOR ALL
  USING (
    "workspaceId" IN (SELECT * FROM get_user_workspace_ids())
  );

-- Grant execute permission on helper function to database user
GRANT EXECUTE ON FUNCTION get_user_workspace_ids() TO PUBLIC;
