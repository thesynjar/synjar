-- Disable RLS for INSERT operations
-- Prisma ORM doesn't support SET LOCAL in interactive transactions properly
-- INSERT operations will be controlled at application level (JwtAuthGuard, service layer validation)
-- SELECT/UPDATE/DELETE operations remain protected by RLS

-- Drop all INSERT policies
DROP POLICY IF EXISTS workspace_insert ON "Workspace";
DROP POLICY IF EXISTS member_insert ON "WorkspaceMember";
DROP POLICY IF EXISTS document_insert ON "Document";
DROP POLICY IF EXISTS chunk_insert ON "Chunk";
DROP POLICY IF EXISTS tag_insert ON "DocumentTag";
DROP POLICY IF EXISTS link_insert ON "PublicLink";

-- Create permissive INSERT policies that allow all inserts
-- Security for INSERT is enforced at application layer
CREATE POLICY workspace_insert_allow ON "Workspace"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY member_insert_allow ON "WorkspaceMember"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY document_insert_allow ON "Document"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY chunk_insert_allow ON "Chunk"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY tag_insert_allow ON "DocumentTag"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY link_insert_allow ON "PublicLink"
  FOR INSERT
  WITH CHECK (true);
