-- Add createdById to Workspace table for RLS visibility
-- This allows newly created workspaces to be visible to their creator
-- via RETURNING clause before membership is committed

-- Step 1: Add nullable column
ALTER TABLE "Workspace" ADD COLUMN "createdById" TEXT;

-- Step 2: Backfill from WorkspaceMember (owner)
UPDATE "Workspace" w
SET "createdById" = wm."userId"
FROM "WorkspaceMember" wm
WHERE wm."workspaceId" = w.id
  AND wm."role" = 'OWNER';

-- Step 3: For workspaces without owner, use first member
UPDATE "Workspace" w
SET "createdById" = (
  SELECT wm."userId"
  FROM "WorkspaceMember" wm
  WHERE wm."workspaceId" = w.id
  ORDER BY wm."createdAt" ASC
  LIMIT 1
)
WHERE "createdById" IS NULL
  AND EXISTS (SELECT 1 FROM "WorkspaceMember" wm WHERE wm."workspaceId" = w.id);

-- Step 4: For workspaces with no members, use default user
-- First get a valid user ID
DO $$
DECLARE
  default_user_id TEXT;
BEGIN
  SELECT id INTO default_user_id FROM "User" LIMIT 1;

  IF default_user_id IS NOT NULL THEN
    UPDATE "Workspace"
    SET "createdById" = default_user_id
    WHERE "createdById" IS NULL;
  END IF;
END $$;

-- Step 5: Make NOT NULL
ALTER TABLE "Workspace" ALTER COLUMN "createdById" SET NOT NULL;

-- Step 6: Add foreign key constraint
ALTER TABLE "Workspace"
ADD CONSTRAINT "Workspace_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 7: Add index
CREATE INDEX "Workspace_createdById_idx" ON "Workspace"("createdById");

-- Step 8: Update RLS policies to allow viewing by creator
-- Drop old SELECT policy
DROP POLICY IF EXISTS workspace_select ON "Workspace";

-- Create new SELECT policy that allows viewing if:
-- 1. User is the creator (createdById matches), OR
-- 2. User is a member (via get_user_workspace_ids())
CREATE POLICY workspace_select ON "Workspace"
  FOR SELECT
  TO PUBLIC
  USING (
    "createdById" = current_setting('app.current_user_id', true)
    OR id IN (SELECT * FROM get_user_workspace_ids())
  );

-- Note: INSERT, UPDATE, DELETE policies remain unchanged
-- INSERT: WITH CHECK (true) - allowed for all authenticated users
-- UPDATE/DELETE: require membership via get_user_workspace_ids()

-- Step 9: Update WorkspaceMember SELECT policy to allow viewing for workspace creators
-- This enables the RETURNING clause to work when creating workspace with nested member
DROP POLICY IF EXISTS member_select ON "WorkspaceMember";

CREATE POLICY member_select ON "WorkspaceMember"
  FOR SELECT
  TO PUBLIC
  USING (
    "workspaceId" IN (SELECT * FROM get_user_workspace_ids())
    OR "workspaceId" IN (
      SELECT id FROM "Workspace"
      WHERE "createdById" = current_setting('app.current_user_id', true)
    )
  );
