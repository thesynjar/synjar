-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "editLockedBy" TEXT,
ADD COLUMN     "editLockedUntil" TIMESTAMPTZ,
ADD COLUMN     "scheduledProcessingAt" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "WorkspaceProcessingQueue" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Document_editLockedUntil_idx" ON "Document"("editLockedUntil");

-- CreateIndex
CREATE INDEX "Document_processingStatus_scheduledProcessingAt_idx" ON "Document"("processingStatus", "scheduledProcessingAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_editLockedBy_fkey" FOREIGN KEY ("editLockedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
