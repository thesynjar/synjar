import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';

/**
 * Creates a PrismaClient with superuser access (bypasses RLS).
 * Used for test setup/teardown where we need direct database access.
 */
export function createSuperuserClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

/**
 * Clean all test data from database.
 *
 * Uses TRUNCATE CASCADE for efficiency and proper cleanup.
 * Order respects foreign key constraints (children first).
 *
 * Note: This should only be used in test environments.
 */
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  // Tables in deletion order (children → parents, respecting FK constraints)
  const tables = [
    'UsageEvent',
    'UsageDaily',
    'InstructionSetDocument',
    'InstructionSet',
    'DocumentTag',
    'Chunk',
    'Document',
    'PublicLink',
    'WorkspaceProcessingQueue',
    'WorkspaceMember',
    'Invitation',
    'UserWorkspaceLookup',
    'Tag',
    'Workspace',
    'User',
  ];

  // Use TRUNCATE CASCADE for efficiency
  // This handles FK constraints automatically
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch {
      // Table might not exist or be empty - ignore
    }
  }
}

/**
 * Clean database for a specific test domain (safer for parallel tests).
 * Uses DELETE instead of TRUNCATE to be more selective.
 */
export async function cleanDatabaseForDomain(
  prisma: PrismaService,
  emailDomain: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      -- Delete UsageEvent entries for test workspaces
      DELETE FROM "UsageEvent"
      WHERE "workspaceId" IN (
        SELECT id FROM "Workspace"
        WHERE "createdById" IN (
          SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
        )
      );

      -- Delete UsageDaily entries for test workspaces
      DELETE FROM "UsageDaily"
      WHERE "workspaceId" IN (
        SELECT id FROM "Workspace"
        WHERE "createdById" IN (
          SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
        )
      );

      -- Delete InstructionSetDocument entries
      DELETE FROM "InstructionSetDocument"
      WHERE "instructionSetId" IN (
        SELECT id FROM "InstructionSet"
        WHERE "workspaceId" IN (
          SELECT id FROM "Workspace"
          WHERE "createdById" IN (
            SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
          )
        )
      );

      -- Delete InstructionSet entries
      DELETE FROM "InstructionSet"
      WHERE "workspaceId" IN (
        SELECT id FROM "Workspace"
        WHERE "createdById" IN (
          SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
        )
      );

      -- Delete PublicLink entries for test workspaces
      DELETE FROM "PublicLink"
      WHERE "workspaceId" IN (
        SELECT id FROM "Workspace"
        WHERE "createdById" IN (
          SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
        )
      );

      -- Delete DocumentTag entries
      DELETE FROM "DocumentTag"
      WHERE "documentId" IN (
        SELECT id FROM "Document"
        WHERE "workspaceId" IN (
          SELECT id FROM "Workspace"
          WHERE "createdById" IN (
            SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
          )
        )
      );

      -- Delete Chunk entries
      DELETE FROM "Chunk"
      WHERE "documentId" IN (
        SELECT id FROM "Document"
        WHERE "workspaceId" IN (
          SELECT id FROM "Workspace"
          WHERE "createdById" IN (
            SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
          )
        )
      );

      -- Delete Document entries
      DELETE FROM "Document"
      WHERE "workspaceId" IN (
        SELECT id FROM "Workspace"
        WHERE "createdById" IN (
          SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
        )
      );

      -- Delete WorkspaceProcessingQueue entries
      DELETE FROM "WorkspaceProcessingQueue"
      WHERE "workspaceId" IN (
        SELECT id FROM "Workspace"
        WHERE "createdById" IN (
          SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
        )
      );

      -- Delete WorkspaceMember entries
      DELETE FROM "WorkspaceMember"
      WHERE "workspaceId" IN (
        SELECT id FROM "Workspace"
        WHERE "createdById" IN (
          SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
        )
      );

      -- Delete Invitation entries
      DELETE FROM "Invitation"
      WHERE "workspaceId" IN (
        SELECT id FROM "Workspace"
        WHERE "createdById" IN (
          SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
        )
      );

      -- Delete UserWorkspaceLookup entries
      DELETE FROM "UserWorkspaceLookup"
      WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
      );

      -- Delete Tag entries for test workspaces
      DELETE FROM "Tag"
      WHERE "workspaceId" IN (
        SELECT id FROM "Workspace"
        WHERE "createdById" IN (
          SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
        )
      );

      -- Delete Workspace entries
      DELETE FROM "Workspace"
      WHERE "createdById" IN (
        SELECT id FROM "User" WHERE email LIKE '%${emailDomain}'
      );

      -- Delete User entries
      DELETE FROM "User" WHERE email LIKE '%${emailDomain}';
    END $$;
  `);
}
