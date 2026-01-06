# ADR-2025-12-29: Seed Script UUID Validation - Lessons Learned

## Status

**Accepted**

## Context

### Incident

After deploying specification `2025-12-28-rls-per-workspace-refactor.md` (commit `9b3776f`), the application stopped working with error:

```
WORKSPACE_CONTEXT_INVALID_UUID
workspaceId: "dev-general-workspace"
```

### Root Cause

1. **New UUID validation** was added in `PrismaService.forWorkspace()`:
   ```typescript
   if (!isUUID(workspaceId)) {
     throw new BadRequestException('Invalid workspace ID format');
   }
   ```

2. **Seed script was not updated** - it still created workspace with `id: 'dev-general-workspace'` (string slug instead of UUID)

3. **Seed uses `PrismaClient` directly**, not `PrismaService`, so it bypasses application validation

### Why wasn't this detected earlier?

- No integration test checking seed + API workflow
- Manual testing didn't include full `db:reset` + UI verification
- Specification didn't contain checklist "update seed if needed"

## Decision

### 1. Seed script must use UUID

```typescript
// BEFORE (incorrect)
const workspace = await prisma.workspace.upsert({
  where: { id: 'dev-general-workspace' },
  create: { id: 'dev-general-workspace', ... }
});

// AFTER (correct)
const DEV_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const workspace = await prisma.workspace.upsert({
  where: { id: DEV_WORKSPACE_ID },
  create: { id: DEV_WORKSPACE_ID, ... }
});
```

### 2. Fixed UUIDs for dev environment

We use deterministic UUIDs for reproducibility:
- `00000000-0000-4000-8000-000000000001` - Dev workspace

### 3. Checklist for specifications changing validation

Every specification adding/changing validation MUST contain section:

```markdown
## Seed & Test Data Impact

- [ ] Check if seed.ts requires update
- [ ] Check if fixtures require update
- [ ] Run `db:reset` + manual test after changes
```

## Consequences

### Positive

- Seed script is now compliant with UUID validation
- Deterministic UUIDs make debugging easier
- Lessons learned documented for future changes

### Negative

- One-time migration of developer data (db:reset)

### Risks

- Other places in code might assume slug format (checked - none found)

## Implementation

- [x] Update `prisma/seed.ts` - use UUID
- [x] Run `db:reset` on development environment
- [ ] Add "Seed & Test Data Impact" section to specification template

## Related

- Spec: `2025-12-28-rls-per-workspace-refactor.md`
- Commit: `9b3776f` (feat: workspace-based RLS)
