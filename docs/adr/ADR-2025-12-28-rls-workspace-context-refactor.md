# ADR-2025-12-28: RLS Workspace Context Refactor

## Status

**Accepted**

## Context

### Current architecture (user-based RLS)

The current RLS (implemented in SPEC-001 3 days ago) uses **user context**:

```sql
CREATE POLICY document_isolation ON "Document"
  FOR ALL
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));
```

Where `get_user_workspace_ids()` is a function:

```sql
CREATE FUNCTION get_user_workspace_ids()
RETURNS SETOF UUID AS $$
  SELECT wm."workspaceId"
  FROM "WorkspaceMember" wm
  WHERE wm."userId" = current_setting('app.current_user_id', true)::UUID
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Problem

**Document Processing Scheduler** requires processing documents per workspace, but:

1. **Current RLS requires `user_id`** - scheduler had to use `workspace.createdById` as context
2. **Semantically incorrect** - scheduler processes workspace, not user
3. **`withoutRls()` is dangerous** - bypasses ENTIRE RLS, sees ALL workspaces

```typescript
// Current solution - PROBLEMATIC
await this.prisma.forUser(workspace.createdById, async (tx) => {
  // Uses workspace owner as context - what if owner leaves workspace?
});

// Alternative - EVEN WORSE
await this.prisma.withoutRls(async (tx) => {
  // Sees ALL data from all workspaces!
});
```

### Why are we changing SPEC-001 after 3 days?

SPEC-001 solved the problem of **API request isolation** (user sees only their workspaces). But it didn't anticipate:

1. **Background jobs** - scheduler has no user context
2. **System operations** - cron jobs, webhooks, migrations
3. **Performance** - JOIN through `WorkspaceMember` in every query

## Decision

**Change the context propagation mechanism from user-based to workspace-based.**

### New architecture (workspace-based RLS)

```sql
CREATE POLICY document_select ON "Document"
  FOR SELECT
  USING ("workspaceId" = current_setting('app.current_workspace_id', true)::UUID);
```

### Key changes

1. **RLS policies** use `app.current_workspace_id` directly
2. **Middleware** verifies membership BEFORE setting context
3. **PrismaService.forWorkspace()** for scheduler and system operations
4. **WorkspaceProcessingQueue** as system table (without RLS) for routing

### Security Model

**Defense in depth:**

1. **Layer 1:** Middleware verifies membership (`WorkspaceMember`)
2. **Layer 2:** RLS policies filter by `workspaceId`

Even if middleware fails, RLS still blocks access (as long as `app.current_workspace_id` wasn't set).

## Alternatives Considered

### Alt 1: Scheduler uses `withoutRls()` + explicit filter

```typescript
await prisma.withoutRls(async (tx) => {
  const docs = await tx.document.findMany({
    where: { workspaceId } // Explicit filter
  });
});
```

**Rejected:**
- `withoutRls()` sees ALL data (dangerous)
- Requires manual filtering (error-prone)
- Logs WARNING (intentionally, to discourage use)

### Alt 2: Scheduler uses `forUser(workspace.ownerId)`

```typescript
const owner = await getWorkspaceOwner(workspaceId);
await prisma.forUser(owner.id, async (tx) => {...});
```

**Rejected:**
- Scheduler shouldn't know about workspace "owner"
- What if owner leaves workspace?
- Semantically incorrect

### Alt 3: Dual context (user + workspace)

```sql
USING (
  "workspaceId" = current_setting('app.current_workspace_id')
  OR "workspaceId" IN (SELECT * FROM get_user_workspace_ids())
)
```

**Rejected:**
- Overcomplication - two mechanisms to maintain
- Performance - still JOIN through `WorkspaceMember`
- Harder to debug

### Alt 4: Separate database per workspace (database isolation)

**Rejected:**
- Huge overhead (each workspace = separate database)
- Complicates migrations, backups, monitoring
- Overkill for our scale

## Consequences

### Positive

1. **Simpler RLS** - direct `workspaceId` comparison, no SQL functions
2. **Scheduler semantically correct** - processes workspace, not user
3. **~15x better performance** - no JOIN in every query
4. **Defense in depth** - middleware + RLS

### Negative

1. **Breaking change** - all `forUser()` calls must be changed
2. **Middleware complexity** - must verify membership before setting context
3. **Hybrid policies** - for endpoints without workspaceId (GET /workspaces) user context still needed

### Risks

| Risk | Mitigation |
|------|------------|
| Middleware doesn't verify membership → RLS bypass | Integration test: alien workspace access returns 403 |
| SQL Injection via workspaceId | UUID validation + `::UUID` cast |
| Migration failure → inconsistent state | Atomic migration (BEGIN/COMMIT) + rollback script |

## Implementation

See: [SPEC: RLS Per-Workspace Refactor](../specifications/2025-12-28-rls-per-workspace-refactor.md)

### Migration Phases

1. **Phase 1-2:** Backwards compatible additions (`forWorkspace()`, `WorkspaceProcessingQueue`)
2. **Phase 3:** Atomic RLS policies migration
3. **Phase 4:** Code refactor (middleware, scheduler, services)
4. **Phase 5:** Cleanup (`forUser()` removal)

## Related

- [SPEC-001: Row Level Security](../specifications/SPEC-001-row-level-security.md) - original implementation
- [SPEC: RLS Per-Workspace Refactor](../specifications/2025-12-28-rls-per-workspace-refactor.md) - detailed spec
- [ADR-2025-12-28: Document Processing Cron](./ADR-2025-12-28-document-processing-cron-vs-queue.md) - scheduler that triggered this ADR

## Notes

### Why not extend SPEC-001?

SPEC-001 defines **user-based RLS** as a fundamental assumption. This change is an **architectural shift** - it deserves a separate ADR and separate specification.

### Future: Organization as tenant

If in the future `Organization` becomes the unit of isolation (one billing for multiple workspaces), RLS context can be extended:

```typescript
forOrganization(orgId, callback)  // Organization context
forWorkspace(workspaceId, callback)  // Workspace context (nested)
```

The current design enables this without breaking changes.
