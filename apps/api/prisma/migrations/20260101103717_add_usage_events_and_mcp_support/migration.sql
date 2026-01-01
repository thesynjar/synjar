-- CreateEnum
CREATE TYPE "HistoryMode" AS ENUM ('OFF', 'ON');

-- CreateEnum
CREATE TYPE "UsageEventSource" AS ENUM ('SEARCH_LINK', 'MCP_SEARCH', 'INSTRUCTION_SET');

-- AlterTable
ALTER TABLE "PublicLink" ADD COLUMN     "historyMode" "HistoryMode" NOT NULL DEFAULT 'OFF';

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "searchLinkId" TEXT,
    "instructionSetId" TEXT,
    "source" "UsageEventSource" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultCount" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "queryStored" BOOLEAN NOT NULL DEFAULT false,
    "queryText" VARCHAR(512),
    "userAgentHash" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageDaily" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "searchLinkId" TEXT,
    "instructionSetId" TEXT,
    "source" "UsageEventSource" NOT NULL,
    "date" DATE NOT NULL,
    "requestCount" INTEGER NOT NULL,
    "avgLatencyMs" INTEGER NOT NULL,
    "billingLockedAt" TIMESTAMPTZ,

    CONSTRAINT "UsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_workspaceId_idx" ON "UsageEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "UsageEvent_searchLinkId_idx" ON "UsageEvent"("searchLinkId");

-- CreateIndex
CREATE INDEX "UsageEvent_instructionSetId_idx" ON "UsageEvent"("instructionSetId");

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_workspaceId_createdAt_idx" ON "UsageEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_workspaceId_source_idx" ON "UsageEvent"("workspaceId", "source");

-- CreateIndex
CREATE INDEX "UsageDaily_workspaceId_idx" ON "UsageDaily"("workspaceId");

-- CreateIndex
CREATE INDEX "UsageDaily_date_idx" ON "UsageDaily"("date");

-- CreateIndex
CREATE INDEX "UsageDaily_workspaceId_date_idx" ON "UsageDaily"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "UsageDaily_billingLockedAt_idx" ON "UsageDaily"("billingLockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageDaily_workspaceId_source_date_searchLinkId_instruction_key" ON "UsageDaily"("workspaceId", "source", "date", "searchLinkId", "instructionSetId");

-- CreateIndex
CREATE INDEX "PublicLink_isActive_idx" ON "PublicLink"("isActive");

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_searchLinkId_fkey" FOREIGN KEY ("searchLinkId") REFERENCES "PublicLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_instructionSetId_fkey" FOREIGN KEY ("instructionSetId") REFERENCES "InstructionSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageDaily" ADD CONSTRAINT "UsageDaily_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageDaily" ADD CONSTRAINT "UsageDaily_searchLinkId_fkey" FOREIGN KEY ("searchLinkId") REFERENCES "PublicLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageDaily" ADD CONSTRAINT "UsageDaily_instructionSetId_fkey" FOREIGN KEY ("instructionSetId") REFERENCES "InstructionSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
