-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "draftContent" TEXT,
ADD COLUMN     "draftTitle" TEXT,
ADD COLUMN     "draftUpdatedAt" TIMESTAMPTZ,
ADD COLUMN     "publishedAt" TIMESTAMPTZ;

-- Backfill publishedAt for existing documents
-- Existing documents are implicitly "published" (they were created before draft/publish was introduced)
UPDATE "Document"
SET "publishedAt" = "createdAt"
WHERE "publishedAt" IS NULL;

-- CreateIndex
CREATE INDEX "Document_draftUpdatedAt_idx" ON "Document"("draftUpdatedAt");
