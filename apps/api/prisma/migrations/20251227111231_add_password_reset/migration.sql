-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetSentAt" TIMESTAMPTZ,
ADD COLUMN     "passwordResetToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- CreateIndex
CREATE INDEX "User_passwordResetToken_idx" ON "User"("passwordResetToken");

-- CreateIndex (was missing from previous migration - fixes drift)
CREATE INDEX "Invitation_token_idx" ON "Invitation"("token");
