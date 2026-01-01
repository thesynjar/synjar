# Fix E2E Test Cleanup for RLS Enforcement

**Date:** 2026-01-01
**Status:** ACTIVE
**Priority:** CRITICAL
**Related:** SPEC-001-row-level-security.md, 2025-12-26-dual-mode-registration.md

---

## Problem Statement

E2E tests fail in CI due to RLS policy enforcement when using non-superuser database connection (`synjar_app`). Test cleanup code uses raw SQL that doesn't set required RLS context (`app.current_user_id` / `app.current_workspace_id`).

**Symptoms:**
- Tests pass locally with `postgres` superuser (RLS bypassed)
- Tests fail in CI with `synjar_app` non-superuser (RLS enforced)
- Error during cleanup: workspace DELETE blocked by RLS policy

**Root Cause:**
```typescript
// Current cleanup - FAILS with RLS
await prisma.$executeRawUnsafe(`
  DELETE FROM "Workspace"
  WHERE "createdById" IN (...)
`);
// Missing: app.current_workspace_id context
```

---

## Goals

1. **Fix CI test failures** - cleanup works with RLS enabled
2. **Production-like testing** - all tests run with non-superuser
3. **Reusable utilities** - shared cleanup helpers for all E2E tests
4. **Documentation** - clear guidelines for RLS-aware testing

---

## Non-Goals

- Changing RLS policies (they are correct)
- Disabling RLS in tests (defeats the purpose)
- Using superuser in production tests

---

## Solution: RLS-Aware Test Cleanup

### 1. Create Cleanup Helper

**File:** `apps/api/test/helpers/cleanup.helper.ts`

```typescript
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';

/**
 * Clean up test users and their workspaces with RLS context.
 * Works with both superuser and non-superuser database connections.
 *
 * @param prisma - PrismaService instance
 * @param emailPattern - SQL LIKE pattern (e.g., '%@test.com')
 *
 * @example
 * await cleanupTestUsers(prisma, '%@registration-e2e-test.com');
 */
export async function cleanupTestUsers(
  prisma: PrismaService,
  emailPattern: string,
): Promise<void> {
  // Get all test users (no RLS on User table)
  const testUsers = await prisma.user.findMany({
    where: { email: { contains: emailPattern.replace('%', '') } },
  });

  if (testUsers.length === 0) {
    return; // Nothing to clean
  }

  // Delete each user's data within their RLS context
  for (const user of testUsers) {
    try {
      // Get user's workspaces within user context
      await prisma.forUser(user.id, async (tx) => {
        const workspaces = await tx.workspace.findMany({
          where: { createdById: user.id },
        });

        // Delete each workspace within workspace context
        for (const workspace of workspaces) {
          // Set workspace context for RLS policies
          await tx.$executeRaw`
            SELECT set_config('app.current_workspace_id', ${workspace.id}::text, true)
          `;

          // Delete workspace members (requires workspace context)
          await tx.workspaceMember.deleteMany({
            where: { workspaceId: workspace.id },
          });

          // Delete workspace (requires workspace context)
          await tx.workspace.delete({
            where: { id: workspace.id },
          });
        }
      });

      // Delete user (no RLS on User table)
      await prisma.user.delete({ where: { id: user.id } });
    } catch (error) {
      console.warn(`Failed to cleanup user ${user.email}:`, (error as Error).message);
      // Continue with other users
    }
  }
}

/**
 * Clean up test data using SECURITY DEFINER function (if available).
 * Faster but requires database function to be created.
 *
 * @param prisma - PrismaService instance
 * @param emailPattern - SQL LIKE pattern (e.g., '%@test.com')
 */
export async function cleanupTestUsersWithFunction(
  prisma: PrismaService,
  emailPattern: string,
): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT cleanup_test_data(${emailPattern})`;
  } catch (error) {
    console.warn('SECURITY DEFINER cleanup failed, falling back to manual cleanup');
    await cleanupTestUsers(prisma, emailPattern);
  }
}
```

### 2. Update registration-e2e.integration.spec.ts

**Before (FAILS with RLS):**
```typescript
afterAll(async () => {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        DELETE FROM "WorkspaceMember" WHERE ...;
        DELETE FROM "Workspace" WHERE ...;
        DELETE FROM "User" WHERE ...;
      END $$;
    `);
  } catch (error) {
    console.warn('Cleanup failed:', (error as Error).message);
  } finally {
    await app.close();
  }
});
```

**After (WORKS with RLS):**
```typescript
import { cleanupTestUsers } from './helpers/cleanup.helper';

afterAll(async () => {
  try {
    await cleanupTestUsers(prisma, '@registration-e2e-test.com');
  } catch (error) {
    console.warn('Cleanup failed:', (error as Error).message);
  } finally {
    await app.close();
  }
});
```

### 3. Add SECURITY DEFINER Function (Optional)

**Migration:** `apps/api/prisma/migrations/YYYYMMDD_add_test_cleanup_function/migration.sql`

```sql
-- Test cleanup function with SECURITY DEFINER
-- Bypasses RLS for cleanup operations (runs as postgres)
CREATE OR REPLACE FUNCTION cleanup_test_data(email_pattern TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as function owner (bypasses RLS)
AS $$
BEGIN
  -- Delete workspace members
  DELETE FROM "WorkspaceMember"
  WHERE "workspaceId" IN (
    SELECT id FROM "Workspace"
    WHERE "createdById" IN (
      SELECT id FROM "User" WHERE email LIKE email_pattern
    )
  );

  -- Delete workspaces
  DELETE FROM "Workspace"
  WHERE "createdById" IN (
    SELECT id FROM "User" WHERE email LIKE email_pattern
  );

  -- Delete users
  DELETE FROM "User" WHERE email LIKE email_pattern;

  -- Log for audit
  RAISE NOTICE 'Cleaned up test data for pattern: %', email_pattern;
END;
$$;

-- Grant execute to application user
GRANT EXECUTE ON FUNCTION cleanup_test_data(TEXT) TO synjar_app;

-- Grant execute to postgres (for migrations)
GRANT EXECUTE ON FUNCTION cleanup_test_data(TEXT) TO postgres;

-- Comment
COMMENT ON FUNCTION cleanup_test_data(TEXT) IS
  'Test cleanup function with SECURITY DEFINER. Only use in test environments!';
```

**Rollback:**
```sql
DROP FUNCTION IF EXISTS cleanup_test_data(TEXT);
```

---

## Implementation Plan

### Phase 1: Immediate Fix (2 hours)

**Goal:** Unblock CI pipeline

1. **Create cleanup helper** (30 min)
   ```bash
   mkdir -p apps/api/test/helpers
   # Create cleanup.helper.ts
   ```

2. **Update registration-e2e test** (30 min)
   ```bash
   # Update registration-e2e.integration.spec.ts
   # Import and use cleanupTestUsers()
   ```

3. **Test locally** (30 min)
   ```bash
   # Test with postgres user
   DATABASE_URL="postgresql://postgres:postgres@localhost:6311/synjar_test" \
     pnpm test:e2e -- --testPathPattern=registration-e2e

   # Test with synjar_app user (if exists)
   DATABASE_URL="postgresql://synjar_app:password@localhost:6311/synjar_test" \
     pnpm test:e2e -- --testPathPattern=registration-e2e
   ```

4. **Verify CI** (30 min)
   ```bash
   git add .
   git commit -m "fix(test): use RLS-aware cleanup in registration e2e tests"
   git push
   # Monitor CI pipeline
   ```

### Phase 2: Systematic Refactor (3 hours)

**Goal:** Update all E2E tests

1. **Audit all test files** (30 min)
   ```bash
   grep -r "\$executeRawUnsafe.*DELETE" apps/api/test/
   grep -r "DO \$\$" apps/api/test/
   ```

2. **Update each test file** (1.5 hours)
   - registration-workspace-visibility.integration.spec.ts
   - tag-isolation.integration.spec.ts
   - instruction-sets.integration.spec.ts
   - Any other files using raw SQL cleanup

3. **Add SECURITY DEFINER migration** (30 min)
   ```bash
   cd apps/api
   pnpm prisma migrate dev --name add_test_cleanup_function
   ```

4. **Test all E2E tests** (30 min)
   ```bash
   pnpm test:e2e:full
   ```

### Phase 3: CI Hardening (2 hours)

**Goal:** Ensure CI uses RLS-enforced setup

1. **Document database user requirements** (30 min)
   ```markdown
   # docs/testing/database-setup.md
   ## Test Database User

   E2E tests MUST use non-superuser to enforce RLS:
   - User: synjar_app (not postgres)
   - Password: (from secrets)
   - Permissions: SELECT, INSERT, UPDATE, DELETE (no DDL)
   ```

2. **Update CI configuration** (30 min)
   ```yaml
   # .github/workflows/ci.yml
   services:
     postgres:
       env:
         # Create synjar_app user
         POSTGRES_INIT_SQL: |
           CREATE ROLE synjar_app LOGIN PASSWORD 'test-password';
           GRANT ALL ON DATABASE synjar_test TO synjar_app;
   ```

3. **Add RLS verification check** (30 min)
   ```bash
   # apps/api/test/verify-rls.sh
   #!/bin/bash
   echo "Verifying RLS is enabled..."
   psql $DATABASE_URL -c "\d+ Workspace" | grep "row security enabled"
   echo "RLS verification passed"
   ```

4. **Update test scripts** (30 min)
   ```bash
   # apps/api/test/run-e2e.sh
   # Add RLS verification before tests
   ./test/verify-rls.sh
   pnpm test:e2e:full
   ```

---

## Testing Strategy

### 1. Test Cleanup with Both Users

```bash
# Test 1: With superuser (should still work)
export DATABASE_URL="postgresql://postgres:postgres@localhost:6311/synjar_test"
pnpm test:e2e -- --testPathPattern=registration-e2e

# Test 2: With non-superuser (RLS enforced)
export DATABASE_URL="postgresql://synjar_app:password@localhost:6311/synjar_test"
pnpm test:e2e -- --testPathPattern=registration-e2e

# Both should PASS
```

### 2. Verify RLS Context is Set

```typescript
it('should set RLS context during cleanup', async () => {
  // Register test user
  const email = `cleanup-test-${Date.now()}@test.com`;
  await registerUser(email);

  // Verify cleanup works
  await cleanupTestUsers(prisma, '@test.com');

  // Verify user is deleted
  const user = await prisma.user.findUnique({ where: { email } });
  expect(user).toBeNull();
});
```

### 3. Verify Workspace Isolation

```typescript
it('should not delete other users workspaces during cleanup', async () => {
  // Create user A
  const userA = await registerUser('usera@test.com');
  const workspaceA = await createWorkspace(userA.id, 'Workspace A');

  // Create user B
  const userB = await registerUser('userb@production.com');
  const workspaceB = await createWorkspace(userB.id, 'Workspace B');

  // Cleanup only test users
  await cleanupTestUsers(prisma, '@test.com');

  // Verify userA deleted
  const deletedUser = await prisma.user.findUnique({ where: { email: 'usera@test.com' } });
  expect(deletedUser).toBeNull();

  // Verify userB NOT deleted
  const remainingUser = await prisma.user.findUnique({ where: { email: 'userb@production.com' } });
  expect(remainingUser).toBeDefined();

  // Cleanup userB
  await cleanupTestUsers(prisma, '@production.com');
});
```

---

## Acceptance Criteria

- [ ] cleanupTestUsers() helper created in test/helpers/cleanup.helper.ts
- [ ] registration-e2e.integration.spec.ts uses new cleanup helper
- [ ] Tests pass locally with both postgres and synjar_app users
- [ ] CI pipeline passes with new cleanup
- [ ] All E2E tests use RLS-aware cleanup (no raw SQL)
- [ ] SECURITY DEFINER function added (optional migration)
- [ ] Database user requirements documented
- [ ] CI configuration updated to use synjar_app
- [ ] RLS verification check added to CI

---

## Risks & Mitigation

### Risk 1: Performance Impact

**Description:** Setting RLS context for each workspace during cleanup might be slower.

**Mitigation:**
- Use SECURITY DEFINER function for faster cleanup (optional)
- Cleanup is in afterAll, not performance-critical
- Benefit: Production-like testing outweighs minor slowdown

### Risk 2: Existing Tests Break

**Description:** Other E2E tests might fail after switching to non-superuser.

**Mitigation:**
- Audit all tests using raw SQL (grep for $executeRawUnsafe)
- Update incrementally, test each file
- Keep DATABASE_URL_MIGRATE option for emergency rollback

### Risk 3: CI Environment Differences

**Description:** CI might not have synjar_app user created.

**Mitigation:**
- Add database init script to CI
- Document user creation in test setup guide
- Fallback to postgres if synjar_app doesn't exist (with warning)

---

## Documentation Updates

### 1. Test Setup Guide

**File:** `docs/testing/setup.md`

```markdown
## Database User for Tests

E2E tests MUST run with non-superuser to enforce RLS:

# Create synjar_app user
psql postgresql://postgres:postgres@localhost:6311/synjar_test -c "
  CREATE ROLE synjar_app LOGIN PASSWORD 'test-password';
  GRANT ALL PRIVILEGES ON DATABASE synjar_test TO synjar_app;
  GRANT ALL ON SCHEMA public TO synjar_app;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO synjar_app;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO synjar_app;
"

# Update .env.test
DATABASE_URL="postgresql://synjar_app:test-password@localhost:6311/synjar_test"
```

### 2. RLS Testing Guidelines

**File:** `docs/testing/rls-testing.md`

```markdown
## Testing with RLS

### Cleanup Best Practices

NEVER use raw SQL for cleanup:
```typescript
// ❌ BAD - Bypasses RLS
await prisma.$executeRawUnsafe(`DELETE FROM "Workspace" WHERE ...`);

// ✅ GOOD - Respects RLS
await cleanupTestUsers(prisma, '@test.com');
```

### Setting RLS Context

```typescript
// For user-scoped operations
await prisma.forUser(userId, async (tx) => {
  // All queries use user context
});

// For workspace-scoped operations
await prisma.forWorkspace(workspaceId, async (tx) => {
  // All queries use workspace context
});
```
```

---

## Success Metrics

1. **CI Pass Rate:** 100% (from current failures)
2. **Test Execution Time:** <5% increase (acceptable trade-off)
3. **Code Coverage:** Maintain existing coverage
4. **RLS Enforcement:** All tests run with non-superuser

---

## References

**Related Specifications:**
- SPEC-001-row-level-security.md - RLS implementation
- 2025-12-26-dual-mode-registration.md - Registration flow

**Related Files:**
- apps/api/src/infrastructure/persistence/prisma/prisma.service.ts
- apps/api/src/infrastructure/persistence/rls/rls.middleware.ts
- apps/api/test/registration-e2e.integration.spec.ts

**Documentation:**
- docs/ecosystem.md - Database user separation
- CLAUDE.md - Testing philosophy

**Migrations:**
- 20251228190000_rls_workspace_context_refactor - Current RLS policies
- 20251225111000_disable_insert_rls - Permissive INSERT policies

---

## Checklist for Implementation

### Phase 1: Immediate Fix (TODAY)
- [ ] Create cleanup.helper.ts with cleanupTestUsers()
- [ ] Update registration-e2e.integration.spec.ts to use helper
- [ ] Test locally with postgres user (should pass)
- [ ] Test locally with synjar_app user (should pass)
- [ ] Push and verify CI passes

### Phase 2: Systematic Refactor (THIS WEEK)
- [ ] Audit all test files for raw SQL cleanup
- [ ] Update tag-isolation.integration.spec.ts
- [ ] Update instruction-sets.integration.spec.ts
- [ ] Update registration-workspace-visibility.integration.spec.ts
- [ ] Add SECURITY DEFINER migration (optional)
- [ ] Test all E2E tests with pnpm test:e2e:full

### Phase 3: CI Hardening (NEXT SPRINT)
- [ ] Document database user requirements
- [ ] Create test/verify-rls.sh script
- [ ] Update CI configuration to use synjar_app
- [ ] Add RLS verification to CI pipeline
- [ ] Create docs/testing/rls-testing.md guide

---

## Conclusion

This specification fixes E2E test failures by implementing RLS-aware cleanup helpers. The solution ensures tests run with RLS enabled (production-like) while maintaining cleanup functionality in both superuser and non-superuser environments.

**Key Takeaway:** Always test with the same database user as production to catch RLS issues early.
