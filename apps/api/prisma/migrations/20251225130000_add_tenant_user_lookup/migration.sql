-- CreateTable
CREATE TABLE "TenantUserEmailLookup" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TenantUserEmailLookup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantUserEmailLookup_emailHash_idx" ON "TenantUserEmailLookup"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUserEmailLookup_emailHash_workspaceId_key" ON "TenantUserEmailLookup"("emailHash", "workspaceId");

-- AddForeignKey
ALTER TABLE "TenantUserEmailLookup" ADD CONSTRAINT "TenantUserEmailLookup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
