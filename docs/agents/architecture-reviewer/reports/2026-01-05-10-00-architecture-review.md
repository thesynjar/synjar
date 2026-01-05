# Architecture Review Report - 2026-01-05

## Context

- **Module:** Documents Context (Community/API)
- **Bounded Context:** Documents (InstructionSet aggregate, Public access ACL)
- **Changed Files:**
  - `apps/api/prisma/migrations/20260105100000_add_public_instruction_set_access/migration.sql`
  - `apps/api/src/application/instruction-set/instruction-set.service.ts`
  - `apps/api/src/infrastructure/persistence/repositories/instruction-set.repository.impl.ts`
  - `apps/api/src/application/public-link/public-link.service.ts`
- **ADRs Read:**
  - ADR-2025-12-28-rls-workspace-context-refactor.md
  - ADR-2025-12-29-seed-uuid-validation-lessons.md
- **Related Flows from ecosystem.md:**
  - RLS Context Propagation (Section 3.3)
  - Workspace Isolation Model (Section 3.2)
  - Documents Context (Section 2.3)

## Summary of Changes

This commit fixes two critical RLS-related bugs:

1. **Bug #1:** Instruction set creation with documents failing with 500 error - RLS context was lost after transaction commit
2. **Bug #2:** Public instruction set access not working - raw SQL queries didn't bypass RLS properly

**Solutions:**
- Added SECURITY DEFINER functions (`lookup_public_instruction_set`, `get_public_instruction_set_documents`)
- Fixed RLS context handling in `InstructionSetService.create()` by wrapping reload in `forWorkspace()`
- Changed `PublicLinkService` from `forUser()` to `forWorkspace()` for consistency with workspace-based RLS

---

## 🟢 EXCELLENT - No Critical Issues Found

This is a **well-executed bugfix** that demonstrates deep understanding of the RLS architecture and follows all enterprise patterns correctly.

---

## ✅ Good Practices

### 1. SECURITY DEFINER Pattern (Infrastructure Layer)

**Excellent implementation** of SECURITY DEFINER functions for public access:

```sql
CREATE OR REPLACE FUNCTION lookup_public_instruction_set(p_id TEXT)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER  -- Bypasses RLS with owner privileges
STABLE            -- Optimization: function doesn't modify data
AS $$
BEGIN
  RETURN QUERY
  SELECT ...
  FROM "InstructionSet" is_
  WHERE is_.id = p_id
    AND is_."isPublic" = true;  -- Security: only public sets
END;
$$;
```

**Why this is correct:**
- Follows established pattern from `lookup_public_link_by_token()` (migration `20251229100000`)
- Security model explicitly documented in comments
- STABLE optimization hint for query planner
- Grants to PUBLIC only for read-only operations
- Defense in depth: verifies `isPublic=true` AND `verificationStatus='VERIFIED'`

**Alignment with ADR-2025-12-28:**
> "For public API token lookups, use SQL SECURITY DEFINER functions like lookup_public_link_by_token() via $queryRaw."

✅ **Perfect compliance.**

---

### 2. RLS Context Management (Application Layer)

**Bug #1 Fix - Reload after transaction:**

```typescript
// BEFORE (buggy - context lost after transaction)
await this.addDocumentInternal(savedEntity, docId, i);
savedEntity = (await this.repository.findById(savedEntity.id))!;

// AFTER (correct - explicit RLS context)
await this.addDocumentInternal(savedEntity, docId, i);
const reloaded = await this.prisma.forWorkspace(workspaceId, async (tx) => {
  const data = await tx.instructionSet.findUnique({
    where: { id: savedEntity.id },
    include: { documents: { ... } }
  });
  if (!data) return null;
  return InstructionSetEntity.reconstitute({ ... });
});
```

**Why this fix is correct:**
- `forWorkspace()` creates a **transaction-scoped** context via `set_config(..., true)`
- Prevents context leak between transactions
- Explicit workspaceId parameter (no implicit context assumptions)
- Defensive null check (`if (!data) return null`)

**Alignment with ecosystem.md Section 3.3:**
> "Using set_config with is_local=true ensures the setting is transaction-scoped"

✅ **Textbook implementation.**

---

### 3. Repository Pattern Compliance (DDD)

**Repository correctly abstracts RLS bypass:**

```typescript
// Repository Interface (Domain Layer - no infrastructure knowledge)
interface IInstructionSetRepository {
  findByIdPublic(id: string): Promise<InstructionSetEntity | null>;
}

// Repository Implementation (Infrastructure Layer)
async findByIdPublic(id: string): Promise<InstructionSetEntity | null> {
  const setRows = await this.prisma.$queryRaw<...>`
    SELECT * FROM lookup_public_instruction_set(${id})
  `;
  // ... maps to entity
}
```

**Why this is correct:**
- Domain layer doesn't know about SECURITY DEFINER functions
- Infrastructure layer encapsulates SQL details
- Entity reconstitution preserves domain invariants
- Repository returns domain entity, not raw database rows

**Alignment with CLAUDE.md ddd-architecture.md:**
> "Repository: Domain-focused API (`findActiveSubscriptionByTenant()`), not generic CRUD"

✅ **Clean separation of concerns.**

---

### 4. Consistent Workspace-Based RLS (Bug #2 Fix)

**PublicLinkService refactored from user-based to workspace-based:**

```typescript
// BEFORE (incorrect - used user context)
const ownerId = link.workspace.createdById;
return this.prisma.forUser(ownerId, async (tx) => {
  const documents = await tx.document.findMany({ ... });
});

// AFTER (correct - workspace context)
return this.prisma.forWorkspace(link.workspaceId, async (tx) => {
  const documents = await tx.document.findMany({ ... });
});
```

**Why this is better:**
- **Semantically correct:** Public links grant workspace access, not user access
- **Consistent with ADR-2025-12-28:** "Zmienić mechanizm context propagation z user-based na workspace-based"
- **Prevents edge case:** What if workspace owner (createdById) leaves the workspace?
- **Simpler:** No need to fetch owner ID

**Performance impact:**
- Direct `workspaceId` comparison in RLS policy (no JOIN through `WorkspaceMember`)
- ~15x faster per ADR-2025-12-28

✅ **Architectural consistency win.**

---

### 5. Defense in Depth (Security)

**Multiple security layers verified:**

```sql
-- Layer 1: SECURITY DEFINER function checks
WHERE is_.id = p_id
  AND is_."isPublic" = true  -- Only public sets

-- Layer 2: Document verification filter
AND d."verificationStatus" = 'VERIFIED'  -- Only verified documents
```

**Plus application layer:**
```typescript
// Layer 3: 404 for both non-existent AND non-public (anti-enumeration)
if (!set) {
  throw new NotFoundException('Instruction set not found');
}
```

**Security properties:**
1. **No enumeration:** Public and non-existent sets return same 404
2. **No unverified leaks:** VERIFIED filter prevents draft exposure
3. **RLS bypass limited:** Only via explicit SECURITY DEFINER functions
4. **Audit trail:** Functions are named and grantable (traceable in logs)

✅ **Enterprise-grade security.**

---

## 🟡 MEDIUM - Code Duplication (DRY Violation)

### Issue: Repeated Entity Reconstitution Code

**Location:** `InstructionSetService` (lines 293-337, 362-403, 518-552, etc.)

**Pattern repeated 8+ times:**

```typescript
const data = await tx.instructionSet.findUnique({
  where: { id },
  include: {
    documents: {
      include: { document: { select: { ... } } },
      orderBy: { order: 'asc' as const },
    },
  },
});
if (!data) return null;
return InstructionSetEntity.reconstitute({
  id: data.id,
  workspaceId: data.workspaceId,
  name: data.name,
  // ... 30 lines of mapping
});
```

**Why this is a problem:**
- 150+ lines of duplicated code (violates DRY)
- Brittle: If entity structure changes, 8 places need updating
- Error-prone: Easy to forget a field in one place
- Hard to maintain: Bug in mapping logic requires 8 fixes

**Suggested refactor:**

```typescript
// Extract to private method
private async findOneWithRLS(
  workspaceId: string,
  id: string,
): Promise<InstructionSetEntity | null> {
  return this.prisma.forWorkspace(workspaceId, async (tx) => {
    const data = await tx.instructionSet.findUnique({
      where: { id },
      include: instructionSetInclude, // Already defined in repository!
    });
    if (!data) return null;
    return this.mapToEntity(data); // Extract mapping
  });
}

private mapToEntity(data: InstructionSetWithDocuments): InstructionSetEntity {
  return InstructionSetEntity.reconstitute({
    id: data.id,
    workspaceId: data.workspaceId,
    // ... single source of truth for mapping
  });
}
```

**Then reuse:**
```typescript
async findOne(workspaceId: string, id: string, userId: string) {
  await this.workspaceService.ensureMember(workspaceId, userId);
  const set = await this.findOneWithRLS(workspaceId, id);
  if (!set) throw new NotFoundException('Instruction set not found');
  return this.toDetailResponse(set);
}
```

**Impact:**
- Reduces service from ~930 lines to ~700 lines (-25%)
- Single source of truth for entity mapping
- Easier to test (extract method = unit testable)
- Follows SOLID-SRP (one reason to change)

**Note:** Repository already has `toEntity()` method (line 38-58) - service could delegate to repository or extract shared mapper.

---

## 🟢 LOW - Documentation & Consistency Suggestions

### 1. Migration Comment Could Reference ADR

**Current:**
```sql
-- Public Instruction Set Lookup Function
-- Similar to lookup_public_link_by_token, this function bypasses RLS
```

**Suggested:**
```sql
-- Public Instruction Set Lookup Function
-- Pattern: SECURITY DEFINER for public access (ADR-2025-12-28)
-- Similar to lookup_public_link_by_token (migration 20251229100000)
```

**Why:** Cross-references help future developers understand architectural decisions.

---

### 2. Service Layer Transaction Handling Comment

**Current:** No comment explaining why reload needs `forWorkspace()`

**Suggested:**
```typescript
// Reload with explicit RLS context - transaction-scoped context was lost
// after addDocumentInternal() commits (ADR-2025-12-28: workspace-based RLS)
const reloaded = await this.prisma.forWorkspace(workspaceId, async (tx) => {
```

**Why:** Prevents future developer from "optimizing away" the forWorkspace() wrapper.

---

### 3. Consistent Null Handling

**Inconsistency found:**

```typescript
// Pattern A (lines 293-337): Defensive null check
if (reloaded) {
  savedEntity = reloaded;
}

// Pattern B (lines 565-571): Assumes non-null with fallback
const updatedAt = data?.updatedAt ?? new Date();
```

**Recommendation:** Standardize on Pattern A (explicit null check) for clarity.

---

## 📋 ADR Compliance

| ADR | Compliance | Notes |
|-----|-----------|-------|
| **ADR-2025-12-28: RLS Workspace Context Refactor** | ✅ **Fully Compliant** | Uses `forWorkspace()` everywhere, SECURITY DEFINER for public access, workspace-based policies |
| **ADR-2025-12-29: Seed UUID Validation** | ✅ **N/A** | No seed changes (not applicable) |

**Key quote from ADR-2025-12-28:**
> "For public API token lookups, use SQL SECURITY DEFINER functions like lookup_public_link_by_token() via $queryRaw."

**Implementation:** Perfect match with `lookup_public_instruction_set()` and `get_public_instruction_set_documents()`.

---

## 🏢 Enterprise Data Modeling

**N/A** - No schema changes in this commit (only functions added).

**Note:** Existing schema for InstructionSet reviewed:
- ✅ Proper 1:N relationship (`InstructionSet` → `InstructionSetDocument` → `Document`)
- ✅ Junction table with ordering (`order` field for drag-and-drop)
- ✅ Workspace isolation via `workspaceId` FK
- ✅ Public access flag (`isPublic` boolean)

**No issues found.**

---

## Summary & Recommendations

### What Was Done Right

1. **Root Cause Analysis:** Identified RLS context loss after transaction commits
2. **Pattern Reuse:** Followed established SECURITY DEFINER pattern from PublicLink
3. **Consistency:** Migrated PublicLinkService to workspace-based RLS
4. **Security:** Defense in depth (isPublic check, VERIFIED filter, anti-enumeration)
5. **Clean Architecture:** Repository abstracts RLS bypass, domain stays pure

### Suggested Improvements

1. **Priority: MEDIUM** - Refactor duplicated entity mapping code (DRY violation)
2. **Priority: LOW** - Add cross-reference comments to ADR in migration
3. **Priority: LOW** - Standardize null handling pattern

### Test Coverage Recommendations

Based on agent instructions, tests should verify:
- ✅ Public access via SECURITY DEFINER functions
- ✅ RLS context maintained after document addition
- ✅ Only VERIFIED documents returned in public sets
- ⚠️ **Missing:** Test for non-public set returns 404 (anti-enumeration)

**Suggested test:**
```typescript
it('returns 404 for non-public instruction set (anti-enumeration)', async () => {
  const set = await createInstructionSet({ isPublic: false });
  const response = await request(app.getHttpServer())
    .get(`/s/${set.id}`)
    .expect(404);
  expect(response.body.message).toBe('Instruction set not found');
});
```

---

## Final Verdict

**Overall Assessment:** ✅ **APPROVED - HIGH QUALITY**

This bugfix demonstrates:
- Deep understanding of workspace-based RLS architecture
- Correct application of SECURITY DEFINER pattern
- Consistent adherence to ADR-2025-12-28 decisions
- Clean separation of concerns (DDD layers)
- Enterprise-grade security practices

**The only issue (code duplication) is technical debt, not a blocker.**

**Recommendation:** Merge as-is, add refactoring task to backlog for DRY improvement.

---

**Reviewed by:** Architecture Reviewer Agent
**Date:** 2026-01-05
**Commit Context:** RLS context fix for instruction set creation + public access
