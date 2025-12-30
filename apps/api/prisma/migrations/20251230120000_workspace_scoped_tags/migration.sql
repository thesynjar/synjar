-- Workspace-scoped Tags Migration
-- Migrates Tag table from global to workspace-scoped
-- PREREQUISITE: Run pre-migration validation queries first (check specification Section 3.3.1)
-- MANDATORY: Database backup before running

-- ============ PRE-MIGRATION VALIDATION ============
-- These are informational checks. The migration will proceed regardless.
-- Run manually if you need to verify before applying.

-- Check 1: Cross-workspace tags (tags used in documents from multiple workspaces)
-- SELECT t.id, t.name, COUNT(DISTINCT d."workspaceId") as workspace_count
-- FROM "Tag" t
-- JOIN "DocumentTag" dt ON dt."tagId" = t.id
-- JOIN "Document" d ON d.id = dt."documentId"
-- GROUP BY t.id, t.name
-- HAVING COUNT(DISTINCT d."workspaceId") > 1;

-- Check 2: Orphan tags count (will be deleted)
-- SELECT COUNT(*) as orphan_count FROM "Tag" t
-- WHERE NOT EXISTS (SELECT 1 FROM "DocumentTag" dt WHERE dt."tagId" = t.id);

-- ============ STEP 1: Add columns (nullable initially) ============

ALTER TABLE "Tag" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Tag" ADD COLUMN "createdAt" TIMESTAMPTZ DEFAULT now();

-- ============ STEP 2: Normalize existing tag names ============
-- Convert to lowercase, replace non-alphanumeric with hyphen, trim leading/trailing hyphens

UPDATE "Tag"
SET name = regexp_replace(
  regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'),
  '^-+|-+$', '', 'g'
)
WHERE name IS NOT NULL;

-- ============ STEP 2.1: Handle duplicates after normalization ============
-- Merge duplicate tags (after normalization) into first tag

DO $$
DECLARE
  dup_name TEXT;
  first_tag_id TEXT;
BEGIN
  FOR dup_name IN
    SELECT name FROM "Tag" GROUP BY name HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO first_tag_id FROM "Tag" WHERE name = dup_name ORDER BY id LIMIT 1;

    -- Repoint DocumentTags to first tag (avoid duplicates)
    UPDATE "DocumentTag" dt
    SET "tagId" = first_tag_id
    WHERE dt."tagId" IN (
      SELECT id FROM "Tag" WHERE name = dup_name AND id != first_tag_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "DocumentTag" existing
      WHERE existing."documentId" = dt."documentId"
        AND existing."tagId" = first_tag_id
    );

    -- Delete DocumentTag entries that would cause duplicates
    DELETE FROM "DocumentTag" dt
    WHERE dt."tagId" IN (
      SELECT id FROM "Tag" WHERE name = dup_name AND id != first_tag_id
    );

    -- Delete duplicate tags
    DELETE FROM "Tag" WHERE name = dup_name AND id != first_tag_id;
  END LOOP;
END $$;

-- ============ STEP 3: Handle cross-workspace tags ============
-- Create separate tags for each workspace that uses a shared tag

DO $$
DECLARE
  tag_rec RECORD;
  new_tag_id TEXT;
  is_first_workspace BOOLEAN;
BEGIN
  FOR tag_rec IN
    SELECT DISTINCT t.id as original_tag_id, t.name, d."workspaceId"
    FROM "Tag" t
    JOIN "DocumentTag" dt ON dt."tagId" = t.id
    JOIN "Document" d ON d.id = dt."documentId"
    WHERE t.id IN (
      SELECT t2.id FROM "Tag" t2
      JOIN "DocumentTag" dt2 ON dt2."tagId" = t2.id
      JOIN "Document" d2 ON d2.id = dt2."documentId"
      GROUP BY t2.id
      HAVING COUNT(DISTINCT d2."workspaceId") > 1
    )
    ORDER BY t.id, d."workspaceId"
  LOOP
    -- Check if this is the first workspace for this tag
    SELECT (tag_rec."workspaceId" = (
      SELECT MIN(d3."workspaceId")
      FROM "DocumentTag" dt3
      JOIN "Document" d3 ON d3.id = dt3."documentId"
      WHERE dt3."tagId" = tag_rec.original_tag_id
    )) INTO is_first_workspace;

    IF is_first_workspace THEN
      -- First workspace keeps the original tag, just update workspaceId
      UPDATE "Tag"
      SET "workspaceId" = tag_rec."workspaceId"
      WHERE id = tag_rec.original_tag_id;
    ELSE
      -- Other workspaces get a new tag
      new_tag_id := gen_random_uuid()::TEXT;

      INSERT INTO "Tag" (id, name, "workspaceId", "createdAt")
      VALUES (new_tag_id, tag_rec.name, tag_rec."workspaceId", now());

      -- Update DocumentTag to point to new tag (for this workspace only)
      UPDATE "DocumentTag" dt
      SET "tagId" = new_tag_id
      FROM "Document" d
      WHERE dt."documentId" = d.id
        AND d."workspaceId" = tag_rec."workspaceId"
        AND dt."tagId" = tag_rec.original_tag_id;
    END IF;
  END LOOP;
END $$;

-- ============ STEP 4: Populate workspaceId for remaining tags ============
-- (Single-workspace tags that weren't handled above)

WITH tag_workspaces AS (
  SELECT DISTINCT
    t.id as tag_id,
    d."workspaceId"
  FROM "Tag" t
  JOIN "DocumentTag" dt ON dt."tagId" = t.id
  JOIN "Document" d ON d.id = dt."documentId"
  WHERE t."workspaceId" IS NULL
)
UPDATE "Tag" t
SET "workspaceId" = tw."workspaceId"
FROM tag_workspaces tw
WHERE t.id = tw.tag_id;

-- ============ STEP 5: Delete orphan tags (no documents) ============

DELETE FROM "Tag" WHERE "workspaceId" IS NULL;

-- ============ STEP 6: Make workspaceId NOT NULL ============

ALTER TABLE "Tag" ALTER COLUMN "workspaceId" SET NOT NULL;

-- ============ STEP 7: Validate no duplicates per workspace ============

DO $$
DECLARE
  conflict_count INT;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM (
    SELECT "workspaceId", name, COUNT(*) as cnt
    FROM "Tag"
    GROUP BY "workspaceId", name
    HAVING COUNT(*) > 1
  ) conflicts;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate tag names per workspace. Cannot proceed.', conflict_count;
  END IF;
END $$;

-- ============ STEP 8: Add foreign key ============

ALTER TABLE "Tag"
ADD CONSTRAINT "Tag_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "Workspace"("id")
ON DELETE CASCADE;

-- ============ STEP 9: Drop old unique constraint, add new ============

ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_name_key";
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_name_key"
UNIQUE ("workspaceId", "name");

-- ============ STEP 10: Add index ============

CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");

-- ============ STEP 11: Enable RLS on Tag table ============

ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tag" FORCE ROW LEVEL SECURITY;

-- ============ STEP 12: Create RLS policies ============

-- SELECT: workspace context only
CREATE POLICY tag_select ON "Tag"
  FOR SELECT
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- INSERT: workspace context only
CREATE POLICY tag_insert ON "Tag"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ("workspaceId" = get_current_workspace_id());

-- UPDATE: workspace context only
CREATE POLICY tag_update ON "Tag"
  FOR UPDATE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id())
  WITH CHECK ("workspaceId" = get_current_workspace_id());

-- DELETE: workspace context only
CREATE POLICY tag_delete ON "Tag"
  FOR DELETE
  TO PUBLIC
  USING ("workspaceId" = get_current_workspace_id());

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'Workspace-scoped tags migration completed successfully';
END $$;
