-- Rollback for 20251226112831_add_invitation_and_grace_period_index
-- IMPORTANT: Test on staging before production use
-- WARNING: This will permanently delete all invitation data

-- 1. Drop foreign keys
ALTER TABLE "Invitation" DROP CONSTRAINT IF EXISTS "Invitation_createdById_fkey";
ALTER TABLE "Invitation" DROP CONSTRAINT IF EXISTS "Invitation_workspaceId_fkey";

-- 2. Drop indexes (Invitation)
DROP INDEX IF EXISTS "Invitation_expiresAt_idx";
DROP INDEX IF EXISTS "Invitation_status_idx";
-- DROP INDEX IF EXISTS "Invitation_token_idx"; -- Never created (duplicate of UNIQUE index)
DROP INDEX IF EXISTS "Invitation_email_idx";
DROP INDEX IF EXISTS "Invitation_workspaceId_idx";
DROP INDEX IF EXISTS "Invitation_token_key";

-- 3. Drop index (User grace period)
DROP INDEX IF EXISTS "User_isEmailVerified_createdAt_idx";

-- 4. Drop Invitation table
DROP TABLE IF EXISTS "Invitation";

-- 5. Drop InvitationStatus enum
DROP TYPE IF EXISTS "InvitationStatus";

-- 6. Remove ADMIN from Role enum
-- NOTE: PostgreSQL doesn't support removing enum values directly
-- This requires more complex migration (create new enum, migrate data, swap)
-- For now, leaving ADMIN in enum (harmless if not used)
-- To fully rollback: would need to recreate Role enum without ADMIN

-- 7. Rename foreign key back (optional - cosmetic only)
ALTER TABLE "UserWorkspaceLookup" RENAME CONSTRAINT "UserWorkspaceLookup_workspaceId_fkey" TO "TenantUserEmailLookup_workspaceId_fkey";

-- WARNING: This rollback does NOT restore isEmailVerified=false for existing users
-- Data migration in forward migration is irreversible without backup
