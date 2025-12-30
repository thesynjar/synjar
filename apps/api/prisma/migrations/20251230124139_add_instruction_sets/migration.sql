/*
  Warnings:

  - Made the column `createdAt` on table `Tag` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "DocumentPurpose" AS ENUM ('KNOWLEDGE', 'INSTRUCTION');

-- DropForeignKey
ALTER TABLE "Tag" DROP CONSTRAINT "Tag_workspaceId_fkey";

-- DropIndex
DROP INDEX "Tag_name_key";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "purpose" "DocumentPurpose" NOT NULL DEFAULT 'KNOWLEDGE';

-- AlterTable
ALTER TABLE "Tag" ALTER COLUMN "createdAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "InstructionSet" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "InstructionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructionSetDocument" (
    "id" TEXT NOT NULL,
    "instructionSetId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InstructionSetDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstructionSet_workspaceId_idx" ON "InstructionSet"("workspaceId");

-- CreateIndex
CREATE INDEX "InstructionSetDocument_instructionSetId_order_idx" ON "InstructionSetDocument"("instructionSetId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "InstructionSetDocument_instructionSetId_documentId_key" ON "InstructionSetDocument"("instructionSetId", "documentId");

-- CreateIndex
CREATE INDEX "Document_purpose_idx" ON "Document"("purpose");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructionSet" ADD CONSTRAINT "InstructionSet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructionSetDocument" ADD CONSTRAINT "InstructionSetDocument_instructionSetId_fkey" FOREIGN KEY ("instructionSetId") REFERENCES "InstructionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructionSetDocument" ADD CONSTRAINT "InstructionSetDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============ RLS POLICIES FOR INSTRUCTION SETS ============

-- Enable RLS on InstructionSet
ALTER TABLE "InstructionSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstructionSet" FORCE ROW LEVEL SECURITY;

-- Policy: Workspace members can SELECT their workspace's sets
CREATE POLICY "instruction_set_select" ON "InstructionSet"
  FOR SELECT
  USING (
    "workspaceId" = current_setting('app.current_workspace_id', true)
  );

-- Policy: Workspace members can INSERT into their workspace
CREATE POLICY "instruction_set_insert" ON "InstructionSet"
  FOR INSERT
  WITH CHECK (
    "workspaceId" = current_setting('app.current_workspace_id', true)
  );

-- Policy: Workspace members can UPDATE their workspace's sets
CREATE POLICY "instruction_set_update" ON "InstructionSet"
  FOR UPDATE
  USING (
    "workspaceId" = current_setting('app.current_workspace_id', true)
  );

-- Policy: Workspace members can DELETE their workspace's sets
CREATE POLICY "instruction_set_delete" ON "InstructionSet"
  FOR DELETE
  USING (
    "workspaceId" = current_setting('app.current_workspace_id', true)
  );

-- Enable RLS on InstructionSetDocument (junction table)
ALTER TABLE "InstructionSetDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstructionSetDocument" FORCE ROW LEVEL SECURITY;

-- Policy: Access through parent InstructionSet
CREATE POLICY "instruction_set_document_all" ON "InstructionSetDocument"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "InstructionSet"
      WHERE "InstructionSet"."id" = "InstructionSetDocument"."instructionSetId"
        AND "InstructionSet"."workspaceId" = current_setting('app.current_workspace_id', true)
    )
  );
