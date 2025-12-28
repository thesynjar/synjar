-- CreateTable: WorkspaceProcessingQueue
-- System table for tracking workspaces with pending documents (scheduler routing)
-- NO RLS - internal system table

-- Create the table
CREATE TABLE "WorkspaceProcessingQueue" (
    "workspaceId" TEXT NOT NULL,
    "pendingDocumentsCount" INTEGER NOT NULL DEFAULT 0,
    "lastProcessedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT "WorkspaceProcessingQueue_pkey" PRIMARY KEY ("workspaceId")
);

-- Add foreign key constraint
ALTER TABLE "WorkspaceProcessingQueue"
ADD CONSTRAINT "WorkspaceProcessingQueue_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create index for efficient lookups
CREATE INDEX "WorkspaceProcessingQueue_pendingDocumentsCount_idx"
ON "WorkspaceProcessingQueue"("pendingDocumentsCount");

-- ============ TRIGGER: Auto-update pendingDocumentsCount ============

-- Function to update pending documents count when Document changes
CREATE OR REPLACE FUNCTION update_pending_documents_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."processingStatus" = 'PENDING' THEN
    -- New PENDING document: insert or increment count
    INSERT INTO "WorkspaceProcessingQueue" ("workspaceId", "pendingDocumentsCount", "updatedAt")
    VALUES (NEW."workspaceId", 1, NOW())
    ON CONFLICT ("workspaceId")
    DO UPDATE SET
      "pendingDocumentsCount" = "WorkspaceProcessingQueue"."pendingDocumentsCount" + 1,
      "updatedAt" = NOW();

  ELSIF TG_OP = 'UPDATE' THEN
    -- Document status changed
    IF OLD."processingStatus" = 'PENDING' AND NEW."processingStatus" != 'PENDING' THEN
      -- Was PENDING, now not: decrement count
      UPDATE "WorkspaceProcessingQueue"
      SET
        "pendingDocumentsCount" = GREATEST(0, "pendingDocumentsCount" - 1),
        "updatedAt" = NOW()
      WHERE "workspaceId" = NEW."workspaceId";

    ELSIF OLD."processingStatus" != 'PENDING' AND NEW."processingStatus" = 'PENDING' THEN
      -- Wasn't PENDING, now is: increment count
      INSERT INTO "WorkspaceProcessingQueue" ("workspaceId", "pendingDocumentsCount", "updatedAt")
      VALUES (NEW."workspaceId", 1, NOW())
      ON CONFLICT ("workspaceId")
      DO UPDATE SET
        "pendingDocumentsCount" = "WorkspaceProcessingQueue"."pendingDocumentsCount" + 1,
        "updatedAt" = NOW();
    END IF;

  ELSIF TG_OP = 'DELETE' AND OLD."processingStatus" = 'PENDING' THEN
    -- Deleted PENDING document: decrement count
    UPDATE "WorkspaceProcessingQueue"
    SET
      "pendingDocumentsCount" = GREATEST(0, "pendingDocumentsCount" - 1),
      "updatedAt" = NOW()
    WHERE "workspaceId" = OLD."workspaceId";
  END IF;

  -- For INSERT/UPDATE return NEW, for DELETE return OLD
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on Document table
CREATE TRIGGER document_pending_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON "Document"
FOR EACH ROW EXECUTE FUNCTION update_pending_documents_count();

-- ============ INITIAL POPULATE ============

-- Populate from existing PENDING documents
INSERT INTO "WorkspaceProcessingQueue" ("workspaceId", "pendingDocumentsCount", "updatedAt")
SELECT
  d."workspaceId",
  COUNT(*)::INTEGER,
  NOW()
FROM "Document" d
WHERE d."processingStatus" = 'PENDING'
GROUP BY d."workspaceId"
ON CONFLICT ("workspaceId")
DO UPDATE SET
  "pendingDocumentsCount" = EXCLUDED."pendingDocumentsCount",
  "updatedAt" = NOW();

-- ============ SECURITY: NO RLS ============

-- This is a system table - should NOT have RLS enabled
-- The table is only accessed by the scheduler (system operation)
-- and is NEVER exposed via API
