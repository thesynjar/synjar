# Documentation Review Report - 2026-01-05

## Documentation Review Results

### Context

- **Specification:** No specific specification found for this bugfix
- **Products affected:** Community (apps/api)
- **ADRs checked:**
  - ADR-2025-12-28-rls-workspace-context-refactor.md (RLS workspace context)
  - ADR-2025-12-29-seed-uuid-validation-lessons.md (not directly related)
- **Related specifications:**
  - SPEC-001-row-level-security.md
  - 2025-12-29-00-27-rls-security-definer-fixes.md
  - 2026-01-01-fix-e2e-rls-test-cleanup.md

### Specification

**Status:** No specification for this bugfix - this is a **bugfix** based on commit ab7dc8a (2026-01-03).

**Context from git history:**
1. Commit `ab7dc8a` (2026-01-03): "fix(rls): update instruction-set service to use forWorkspace for RLS context"
2. Commit `1a5e593` (2026-01-05): "fix: use forWorkspace instead of forUser for public link document access"

These commits fix **two RLS-related bugs**:

1. **Instruction Set Creation Bug (ab7dc8a):**
   - Problem: RLS context was lost after transaction when adding documents
   - Root cause: Service used mixed `forUser()` and direct Prisma calls without proper RLS context
   - Solution: Consistently use `forWorkspace()` throughout service

2. **Public Instruction Set Access Bug (migration 20260105100000):**
   - Problem: Raw SQL query for public access didn't bypass RLS (returned no documents)
   - Root cause: Regular `$queryRaw` respects RLS policies, needs SECURITY DEFINER functions
   - Solution: Created SECURITY DEFINER functions similar to `lookup_public_link_by_token()`

### 🔴 CRITICAL (documentation is misleading)

**None found.** The changes are consistent with existing RLS architecture.

### 🟠 HIGH (missing key documentation)

#### 1. Missing ADR for SECURITY DEFINER Pattern Extension

**Problem:** The codebase now has **two SECURITY DEFINER functions** for public access:
- `lookup_public_link_by_token()` (for PublicLink)
- `lookup_public_instruction_set()` + `get_public_instruction_set_documents()` (for InstructionSet)

But there's no ADR documenting when/how to use this pattern.

**Recommendation:** Create ADR documenting:
- When to use SECURITY DEFINER vs forWorkspace()
- Pattern for public access endpoints
- Security checklist (isPublic=true, VERIFIED documents only, etc.)

#### 2. ecosystem.md Missing InstructionSet Bounded Context

**Problem:** `docs/ecosystem.md` doesn't mention InstructionSet feature at all, yet it's a significant entity with:
- Public access (unauthenticated)
- Document aggregation
- SECURITY DEFINER functions
- Optimistic locking

**Location:** `docs/ecosystem.md` lines 18-44 (Bounded Contexts section)

**Recommendation:** Add InstructionSet to bounded contexts:
```markdown
### Document Context

**Entities:**
- `Document` - dokument tekstowy lub plik
- `Chunk` - fragment dokumentu z embedding (vector)
- `Tag` - etykieta workspace-scoped
- `DocumentTag` - relacja Document ↔ Tag
- `InstructionSet` - zestaw dokumentów dla LLM (public access)
- `InstructionSetDocument` - relacja InstructionSet ↔ Document (ordered)
```

### 🟡 MEDIUM (needs completion)

#### 1. SPEC-001 Missing InstructionSet SECURITY DEFINER Functions

**Problem:** SPEC-001 documents `lookup_public_link_by_token()` but doesn't mention the new InstructionSet SECURITY DEFINER functions.

**Location:** `docs/specifications/SPEC-001-row-level-security.md` lines 21, 78-82

**Recommendation:** Update the refactorization changes table to include InstructionSet:
```markdown
| **Public API** | `withoutRls()` | SECURITY DEFINER functions: `lookup_public_link_by_token()`, `lookup_public_instruction_set()` |
```

#### 2. Migration Lacks "Why" Comment

**Problem:** Migration `20260105100000_add_public_instruction_set_access/migration.sql` has good security comments but doesn't explain WHY this is needed (context of the bug).

**Location:** Migration file lines 1-9

**Recommendation:** Add bug context comment:
```sql
-- Public Instruction Set Lookup Function
-- CONTEXT: Fixes bug where public instruction sets returned no documents.
-- Raw $queryRaw respects RLS policies, so unauthenticated requests get filtered out.
-- This SECURITY DEFINER function bypasses RLS for PUBLIC instruction sets only.
--
-- Similar to lookup_public_link_by_token, this function bypasses RLS
-- to allow unauthenticated access to public instruction sets.
```

#### 3. No Documentation for InstructionSet Feature

**Problem:** InstructionSet is a user-facing feature but has no documentation in `docs/user-guides/` or specification explaining the feature.

**Recommendation:** Create `docs/user-guides/instruction-sets.md` documenting:
- What are instruction sets (document collections for LLM context)
- How to create and manage them
- Public sharing (isPublic flag)
- Token estimation and size limits
- Optimistic locking (concurrent edit protection)

### 🟢 LOW (suggestion)

#### 1. Code Comments Could Reference ADR

**Problem:** `instruction-set.service.ts` uses `forWorkspace()` extensively but doesn't reference WHY (ADR-2025-12-28).

**Location:** `apps/api/src/application/instruction-set/instruction-set.service.ts` lines 95, 157, 214, etc.

**Recommendation:** Add reference comment at top of file:
```typescript
/**
 * InstructionSet Service
 *
 * Uses forWorkspace() for all RLS-protected operations.
 * See: ADR-2025-12-28-rls-workspace-context-refactor.md
 */
```

#### 2. Migration Could Document Verification Pattern

**Problem:** Migration enforces `verificationStatus = 'VERIFIED'` but doesn't explain the security model.

**Location:** Migration line 79

**Recommendation:** Add comment:
```sql
WHERE isd."instructionSetId" = p_instruction_set_id
  AND d."verificationStatus" = 'VERIFIED' -- Only expose verified documents to prevent leaked drafts
ORDER BY isd."order";
```

### ✅ What is Well Documented

1. **Migration has excellent security comments** - explains SECURITY DEFINER purpose, validation logic
2. **Function grants are explicit** - `GRANT EXECUTE ... TO PUBLIC` clearly documented
3. **Verification notice at end of migration** - helps with deployment verification
4. **Service uses consistent RLS pattern** - all operations properly wrapped in `forWorkspace()`
5. **SPEC-001 refactorization table** - clearly documents workspace-based vs user-based RLS changes

### 📝 Required Updates

| Document | What to Update |
|----------|----------------|
| ecosystem.md | Add InstructionSet to Document Context bounded context (lines 88-112) |
| SPEC-001 | Update Public API row in refactorization table to include InstructionSet functions (line 21) |
| ADR (new) | Create ADR-2026-01-05-security-definer-pattern.md documenting when to use SECURITY DEFINER |
| user-guides/ | Create instruction-sets.md explaining the feature |

### 💡 Documentation Improvement Suggestions

| Document | Suggestion |
|----------|------------|
| ecosystem.md | Add section "Public Access Pattern" explaining SECURITY DEFINER + isPublic + VERIFIED documents |
| SPEC-001 | Add checklist "Creating SECURITY DEFINER functions" with security requirements |
| Migration | Add rollback script (down.sql) for SECURITY DEFINER functions |
| Code comments | Reference ADR-2025-12-28 in services using forWorkspace() pattern |

## Summary

### Overall Assessment: ⚠️ MEDIUM - Documentation Lagging Behind Implementation

**Why MEDIUM not HIGH:**
- Core RLS architecture is well-documented in SPEC-001 and ADR-2025-12-28
- New pattern (SECURITY DEFINER for InstructionSet) follows existing pattern (PublicLink)
- Code is self-documenting with good inline comments

**However:**
- InstructionSet feature is completely missing from architecture documentation (ecosystem.md)
- No ADR documenting the SECURITY DEFINER pattern (when to use, how to implement securely)
- No user-facing documentation for instruction sets feature
- SPEC-001 doesn't mention InstructionSet SECURITY DEFINER functions

### Recommended Action Plan

**Phase 1 (Before Next Feature):**
1. Update ecosystem.md to include InstructionSet in bounded contexts
2. Update SPEC-001 refactorization table to mention InstructionSet

**Phase 2 (Next Sprint):**
3. Create ADR-2026-01-05-security-definer-pattern.md
4. Create user-guides/instruction-sets.md

**Phase 3 (Future):**
5. Add "Public Access Pattern" section to ecosystem.md
6. Create security checklist for SECURITY DEFINER functions

## Verification Checklist

- [x] Read docs/README.md
- [x] Read docs/ecosystem.md
- [x] Listed all ADRs
- [x] Listed recent specifications
- [x] Checked git changes
- [x] Found related specification (none - this is a bugfix)
- [x] Verified specification status (N/A)
- [x] Checked ecosystem.md for architectural changes
- [x] Checked ADRs for architectural decisions
- [x] Checked for missing documentation
- [x] Proposed specific improvements
- [x] Saved report to file

## Related Files

- `/Users/michalkukla/development/synjar/enterprise/community/apps/api/prisma/migrations/20260105100000_add_public_instruction_set_access/migration.sql`
- `/Users/michalkukla/development/synjar/enterprise/community/apps/api/src/application/instruction-set/instruction-set.service.ts`
- `/Users/michalkukla/development/synjar/enterprise/community/apps/api/src/infrastructure/persistence/repositories/instruction-set.repository.impl.ts`
- `/Users/michalkukla/development/synjar/enterprise/community/docs/specifications/SPEC-001-row-level-security.md`
- `/Users/michalkukla/development/synjar/enterprise/community/docs/specifications/2025-12-29-00-27-rls-security-definer-fixes.md`
- `/Users/michalkukla/development/synjar/enterprise/community/docs/adr/ADR-2025-12-28-rls-workspace-context-refactor.md`
- `/Users/michalkukla/development/synjar/enterprise/community/docs/ecosystem.md`
