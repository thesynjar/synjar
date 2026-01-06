# SPEC-001: Row Level Security (RLS)

**Date:** 2025-12-24
**Status:** Done (Refactored)
**Priority:** P0 (Foundation)
**Dependencies:** None

> **Note (2025-12-28):** RLS mechanism was refactored from user-based to workspace-based context.
> Details: [2025-12-28-rls-per-workspace-refactor.md](./2025-12-28-rls-per-workspace-refactor.md)

### Refactorization Changes (2025-12-28 + 2025-12-29)

**Breaking changes from SPEC-001 initial implementation:**

| Component | SPEC-001 (user-based) | After Refactor (workspace-based) |
|-----------|----------------------|----------------------------------|
| **Context variable** | `app.current_user_id` | `app.current_workspace_id` |
| **Helper function** | `get_user_workspace_ids()` | Removed (direct comparison) |
| **Policies** | `workspaceId IN (SELECT get_user_workspace_ids())` | `workspaceId = current_workspace_id` |
| **PrismaService** | `forUser(userId)` | `forWorkspace(workspaceId)` + `forUser()` (kept) |
| **Public API** | `withoutRls()` | SECURITY DEFINER function `lookup_public_link_by_token()` |
| **Performance** | ~15ms (JOIN through WorkspaceMember) | ~1ms (direct comparison) |

**Non-breaking (still valid):**
- RLS enabled on all workspace-scoped tables
- Defense in depth principle
- Transaction-scoped context (`set_config(..., true)`)

**Security improvements (2025-12-29):**
- `withoutRls()` removed - eliminated dangerous application-level RLS bypass
- SECURITY DEFINER function - limited scope (only token lookup, not arbitrary queries)
- Validation in SQL - `isActive` and `expiresAt` checked at database level
- Principle of least privilege - function cannot be misused for other queries

**See:**
- [2025-12-28: RLS Per-Workspace Refactor](./2025-12-28-rls-per-workspace-refactor.md)
- [2025-12-29: SECURITY DEFINER Fixes](./2025-12-29-00-27-rls-security-definer-fixes.md)

---

## 1. Business Goal

Ensure data isolation between workspaces at the database level. Even in case of an application code bug, a user cannot access data from another workspace.

### MVP Value

- Customer data security
- Compliance-ready (GDPR, SOC2)
- Defense in depth - second layer of protection after application code

---

## 2. Functional Requirements

### 2.1 RLS Policies

| Table | Policy | Description |
|-------|--------|-------------|
| `Workspace` | `workspace_isolation` | User sees only workspaces they are a member of |
| `WorkspaceMember` | `member_isolation` | User sees only memberships of their workspaces |
| `Document` | `document_isolation` | User sees only documents from workspaces they are a member of |
| `Chunk` | `chunk_isolation` | User sees only chunks from documents they have access to |
| `DocumentTag` | `tag_isolation` | User sees only tags of documents they have access to |
| `PublicLink` | `public_link_isolation` | User sees only links from their workspaces |

### 2.2 Session context

Application sets `app.current_user_id` at the beginning of each request:

```sql
SET LOCAL app.current_user_id = 'uuid-user-id';
```

### 2.3 Exceptions

- `User` table - no RLS (user can only see themselves via JWT)
- `Tag` table - global (tags are shared between workspaces)
- Public API - SECURITY DEFINER function for token lookup, then RLS via `forWorkspace()`
  - `lookup_public_link_by_token()` - safely bypasses RLS only for token lookup
  - Validates `isActive=true` and `expiresAt > NOW()` at database level
  - After validation: `forWorkspace(workspaceId)` for queries with RLS

---

## 3. Data Model

### 3.1 No changes in Prisma schema

RLS is implemented via raw SQL migrations, does not require changes to schema.prisma.

### 3.2 SQL Migration

```sql
-- Enable RLS on tables
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Chunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicLink" ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner (app user)
ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Chunk" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTag" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PublicLink" FORCE ROW LEVEL SECURITY;

-- Helper function: get current user's workspace IDs
CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT wm."workspaceId"::UUID
  FROM "WorkspaceMember" wm
  WHERE wm."userId" = current_setting('app.current_user_id', true)::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Policy: Workspace isolation
CREATE POLICY workspace_isolation ON "Workspace"
  FOR ALL
  USING (
    id::UUID IN (SELECT get_user_workspace_ids())
  );

-- Policy: WorkspaceMember isolation
CREATE POLICY member_isolation ON "WorkspaceMember"
  FOR ALL
  USING (
    "workspaceId"::UUID IN (SELECT get_user_workspace_ids())
  );

-- Policy: Document isolation
CREATE POLICY document_isolation ON "Document"
  FOR ALL
  USING (
    "workspaceId"::UUID IN (SELECT get_user_workspace_ids())
  );

-- Policy: Chunk isolation (through document)
CREATE POLICY chunk_isolation ON "Chunk"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId"::UUID IN (SELECT get_user_workspace_ids())
    )
  );

-- Policy: DocumentTag isolation (through document)
CREATE POLICY tag_isolation ON "DocumentTag"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId"::UUID IN (SELECT get_user_workspace_ids())
    )
  );

-- Policy: PublicLink isolation
CREATE POLICY public_link_isolation ON "PublicLink"
  FOR ALL
  USING (
    "workspaceId"::UUID IN (SELECT get_user_workspace_ids())
  );
```

---

## 4. Implementation

### 4.1 RLS Middleware (NestJS)

```typescript
// src/infrastructure/persistence/rls/rls.middleware.ts

@Injectable()
export class RlsMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = req.user as JwtPayload | undefined;

    if (user?.sub) {
      // Set session variable for RLS
      await this.prisma.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = '${user.sub}'`
      );
    }

    next();
  }
}
```

### 4.2 Prisma Transaction Wrapper

```typescript
// src/infrastructure/persistence/prisma/prisma.service.ts

@Injectable()
export class PrismaService extends PrismaClient {

  async withRls<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = '${userId}'`
      );
      return fn();
    });
  }
}
```

### 4.3 Bypass for Public API

```typescript
// src/infrastructure/persistence/rls/rls-bypass.service.ts

@Injectable()
export class RlsBypassService {
  constructor(private prisma: PrismaService) {}

  // Used only by PublicController
  async withBypass<T>(fn: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Reset user context - RLS policies return empty for null user
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = ''`
      );
      // Or use a dedicated connection without RLS
      return fn();
    });
  }
}
```

### 4.4 Alternative: Separate DB role for public API

```sql
-- Role without RLS restrictions
CREATE ROLE synjar_public;
GRANT SELECT ON "Document", "Chunk", "PublicLink" TO synjar_public;

-- Policy for public role (everything visible)
CREATE POLICY public_access ON "Document"
  FOR SELECT
  TO synjar_public
  USING (true);
```

---

## 5. Acceptance Tests

### 5.1 Test: Workspace isolation

```gherkin
Scenario: User does not see documents from another workspace
  Given User A is a member of Workspace A
  And User B is a member of Workspace B
  And Document X belongs to Workspace B
  When User A executes GET /workspaces/{wsA}/documents
  Then Response does not contain Document X

Scenario: User does not see another workspace
  Given User A is a member of Workspace A
  And Workspace B exists (User A is not a member)
  When User A executes GET /workspaces
  Then Response does not contain Workspace B
```

### 5.2 Test: RLS blocks even with code bug

```gherkin
Scenario: Attempt to access document via ID manipulation
  Given User A is a member of Workspace A
  And Document X (id: "doc-x") belongs to Workspace B
  When User A executes GET /workspaces/{wsA}/documents/doc-x
  Then Response status 404 (document invisible due to RLS)
```

### 5.3 Test: Public API works despite RLS

```gherkin
Scenario: Public API returns documents without user context
  Given PublicLink with token "abc123" for Workspace A
  And Document X belongs to Workspace A
  When External system executes GET /public/abc123/search?query=test
  Then Response contains results from Document X
```

---

## 6. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Performance (additional joins) | Medium | Low | Indexes on workspaceId, cache get_user_workspace_ids() |
| Forgetting SET LOCAL | Low | High | Middleware + integration tests |
| Bypass in wrong place | Low | High | Code review, dedicated RlsBypassService |

---

## 7. Definition of Done

- [x] SQL migration with RLS policies
- [x] RLS Middleware in NestJS
- [x] `forUser()` and `withCurrentUser()` wrapper in PrismaService
- [x] RlsBypassService for Public API (implemented as `withoutRls()` in PrismaService)
- [x] Integration tests for isolation (**26/26 tests PASSING**)
- [x] Non-superuser database user (`knowledge_forge_app`)
- [x] Performance tests (benchmark before/after RLS) - **avg 0.93ms, max 1.40ms**
- [x] Documentation in README

---

## 8. Estimation

| Task | Complexity |
|------|------------|
| SQL Migration | S |
| RLS Middleware | S |
| PrismaService wrapper | S |
| Public API bypass | S |
| Tests | M |
| **TOTAL** | **M** |

---

## 9. Implementation Notes (2025-12-25)

### Status: ✅ FULLY IMPLEMENTED

### Final Solution
The key insight from `core-platform` was to use a direct column comparison for INSERT policies
(like `tenant_id = require_tenant_context()`) instead of subquery-based policies.

**Solution applied:** Added `createdById` column to Workspace table and use it in INSERT policy:
```sql
CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  WITH CHECK ("createdById" = get_current_user_id());
```

This follows the same pattern as core-platform's multi-tenant RLS and works correctly with Prisma ORM.

### Migrations Applied
1. `20251225102653_add_rls` - Initial RLS setup with policies
2. `20251225103500_fix_rls_function` - Fixed TEXT/UUID type mismatch
3. `20251225104500_add_system_bypass` - Added SYSTEM context for bypassing RLS
4. `20251225105000_fix_insert_policies` - Split policies into SELECT/INSERT/UPDATE/DELETE
5. `20251225110000_fix_insert_check` - Fixed INSERT WITH CHECK clause
6. `20251225120000_add_created_by_to_workspace` - Added createdById column
7. `20251225140000_fix_workspace_rls` - Final fix with createdById-based INSERT policy

### Components
1. **Database User**: `synjar_app` (non-superuser, RLS enforced)
2. **RlsMiddleware**: Sets `app.current_user_id` from JWT
3. **PrismaService**:
   - `forUser(userId, callback)` - execute with specific user context
   - `withCurrentUser(callback)` - execute with current request user
   - `withoutRls(callback)` - bypass RLS using SYSTEM context
4. **PrismaSystemService**: Superuser client for migrations/tests
5. **UserContext**: AsyncLocalStorage-based request isolation

### Database Configuration
```bash
# Application uses non-superuser (RLS enforced)
DATABASE_URL="postgresql://synjar_app:...@localhost:6201/synjar"

# Superuser for migrations only
DATABASE_URL_MIGRATE="postgresql://postgres:...@localhost:6201/synjar"
```

### Test Results: 26/26 PASSING
- 8 test suites covering all RLS scenarios
- Workspace, Document, Chunk, WorkspaceMember, PublicLink isolation
- ID manipulation blocking
- Stress tests (50+ parallel operations)
- Context switching tests

### Key Learnings
1. PostgreSQL superuser always bypasses RLS - use non-superuser for production
2. For INSERT policies, use direct column comparison (`createdById = get_current_user_id()`) not subquery
3. Subquery-based policies (like `id IN (SELECT get_user_workspace_ids())`) have chicken-and-egg problem for INSERT
4. Prisma ORM interactive transactions work correctly with `set_config()` when policies are designed properly
5. Follow core-platform pattern: one policy per operation type, direct value comparison for INSERT

### Current Status
- **RLS Tests**: 26/26 PASSING
- **Development mode**: Uses non-superuser (`synjar_app`) - production-like environment
- **Full API flow**: Register → Login → Create Workspace → List Workspaces - all working with RLS enforced

## 10. Next Specification

After RLS implementation: **ENTERPRISE-007: Plan and Subscription Model** (enterprise repo)
