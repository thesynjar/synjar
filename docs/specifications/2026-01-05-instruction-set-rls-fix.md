# [2026-01-05] Instruction Set RLS Fix - Context Loss & Public Access

## Status

- [x] Bug #1: RLS context loss after transaction (FIXED)
- [x] Bug #2: Public instruction set access not working (FIXED)
- [ ] HIGH #1 - Integration test for create with documents
- [ ] HIGH #2 - Integration test for SECURITY DEFINER functions
- [ ] HIGH #3 - Audit logging for public access
- [ ] MEDIUM tasks - Code quality improvements
- [ ] LOW tasks - Backlog

## Context

Specification created based on code review from 2026-01-05.
Fixes two critical RLS-related bugs in instruction set functionality.

**Technical Context:**

**Bug #1:** Instruction set creation with documents failing with 500 error
- Root cause: RLS context was lost after transaction when reloading entity via repository
- Solution: Wrap reload in explicit `forWorkspace()` transaction context

**Bug #2:** Public instruction set access not working
- Root cause: Raw `$queryRaw` respects RLS policies, so unauthenticated requests got filtered out
- Solution: Created SECURITY DEFINER functions similar to `lookup_public_link_by_token()`

**Changed Files:**
- `apps/api/prisma/migrations/20260105100000_add_public_instruction_set_access/migration.sql`
- `apps/api/src/application/instruction-set/instruction-set.service.ts`
- `apps/api/src/infrastructure/persistence/repositories/instruction-set.repository.impl.ts`
- `apps/api/src/application/public-link/public-link.service.ts` (consistency fix)

## Related Reports

- [Security Review](../agents/security-reviewer/reports/2026-01-05-instruction-set-rls-fix-review.md)
- [Architecture Review](../agents/architecture-reviewer/reports/2026-01-05-10-00-architecture-review.md)
- [Test Review](../agents/test-reviewer/reports/2026-01-05-instruction-set-rls-fix-review.md)
- [Code Quality Review](../agents/code-quality-reviewer/reports/2026-01-05-instruction-set-rls-fix-review.md)
- [Documentation Review](../agents/documentation-reviewer/reports/2026-01-05-12-30-instruction-set-rls-fix-review.md)

## Related Specifications and ADRs

- [SPEC-001: Row Level Security](./SPEC-001-row-level-security.md)
- [SPEC: RLS SECURITY DEFINER Fixes](./2025-12-29-00-27-rls-security-definer-fixes.md)
- [ADR-2025-12-28: RLS Workspace Context Refactor](../adr/ADR-2025-12-28-rls-workspace-context-refactor.md)

---

## What Was Fixed

### Bug #1: RLS Context Loss After Transaction

**Problem:**
Creating an instruction set with initial documents failed with 500 error. After adding each document in a transaction, the service attempted to reload the entity using `repository.findById()`, which lost the RLS context set by the transaction.

**Root Cause:**
```typescript
// BAD - loses RLS context after transaction
await this.addDocumentInternal(savedEntity, docId, i);
savedEntity = (await this.repository.findById(savedEntity.id))!;
```

The `repository.findById()` method assumes RLS context is already set, but after the transaction commits, the context (set via `set_config(..., true)`) is cleared.

**Solution Applied:**
```typescript
// GOOD - maintains RLS context
await this.addDocumentInternal(savedEntity, docId, i);
const reloaded = await this.prisma.forWorkspace(workspaceId, async (tx) => {
  const data = await tx.instructionSet.findUnique({
    where: { id: savedEntity.id },
    include: { documents: { ... } }
  });
  if (!data) return null;
  return InstructionSetEntity.reconstitute({ ... });
});
if (reloaded) {
  savedEntity = reloaded;
}
```

**Impact:** Users can now create instruction sets with initial documents without encountering 500 errors.

---

### Bug #2: Public Instruction Set Access Not Working

**Problem:**
Public instruction sets (with `isPublic=true`) returned no documents when accessed via unauthenticated public API endpoints. Raw `$queryRaw` queries respect RLS policies, so without workspace context, all results were filtered out.

**Root Cause:**
```typescript
// BAD - respects RLS, gets filtered out for unauthenticated requests
const setRows = await this.prisma.$queryRaw`
  SELECT * FROM "InstructionSet" WHERE id = ${id} AND "isPublic" = true
`;
```

**Solution Applied:**
Created two SECURITY DEFINER functions following the established pattern from `lookup_public_link_by_token()`:

```sql
-- 1. Metadata lookup
CREATE FUNCTION lookup_public_instruction_set(p_id TEXT)
RETURNS TABLE (...)
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT ... FROM "InstructionSet" is_
  WHERE is_.id = p_id AND is_."isPublic" = true;
END;
$$;

-- 2. Document retrieval (VERIFIED only)
CREATE FUNCTION get_public_instruction_set_documents(p_instruction_set_id TEXT)
RETURNS TABLE (...)
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT ...
  FROM "InstructionSetDocument" isd
  JOIN "Document" d ON isd."documentId" = d.id
  WHERE isd."instructionSetId" = p_instruction_set_id
    AND d."verificationStatus" = 'VERIFIED'
  ORDER BY isd."order";
END;
$$;
```

**Security Model:**
- Database-level validation: Only `isPublic=true` sets are returned
- Document filtering: Only `VERIFIED` documents are exposed (prevents draft leakage)
- Anti-enumeration: Returns 404 for both non-existent and non-public sets
- Defense in depth: Multiple layers of authorization (SQL + application)

**Impact:** Public instruction sets now work correctly for unauthenticated API access.

---

### Consistency Fix: PublicLinkService

**Related Change:**
Migrated `PublicLinkService` from user-based to workspace-based RLS context:

```typescript
// BEFORE (semantically incorrect)
const ownerId = link.workspace.createdById;
return this.prisma.forUser(ownerId, async (tx) => { ... });

// AFTER (correct)
return this.prisma.forWorkspace(link.workspaceId, async (tx) => { ... });
```

**Rationale:** Public links grant workspace access, not user access. Using `forWorkspace()` is semantically correct and ~15x faster (direct comparison vs JOIN through WorkspaceMember).

---

## Tasks to Complete

### HIGH (must be done before next release)

#### 1. Add Integration Test for Create with Documents

**Priority:** HIGH
**Estimated:** 2 hours
**Location:** `test/instruction-sets.integration.spec.ts`
**Report:** Test Review - HIGH #1

**Problem:** The main bug (500 error when creating instruction set with documents) is not covered by existing tests.

**Action:**
Create integration test for the complete flow: create set → add initial documents → verify reload works.

```typescript
// In test/instruction-sets.integration.spec.ts
describe('Instruction Set Creation', () => {
  it('should create instruction set with initial documents', async () => {
    // Arrange
    const doc1 = await prismaSuperuser.document.create({
      data: {
        title: 'Doc 1',
        content: 'Content 1',
        contentType: 'TEXT',
        workspaceId: workspaceA.id,
        verificationStatus: 'VERIFIED',
      },
    });

    const doc2 = await prismaSuperuser.document.create({
      data: {
        title: 'Doc 2',
        content: 'Content 2',
        contentType: 'TEXT',
        workspaceId: workspaceA.id,
        verificationStatus: 'VERIFIED',
      },
    });

    // Act - Create set with documents (this triggers the reload path)
    const service = module.get<InstructionSetService>(InstructionSetService);
    const result = await service.create(workspaceA.id, userA.id, {
      name: 'Test Set',
      documentIds: [doc1.id, doc2.id],
    });

    // Assert - Verify documents were added and entity reloaded successfully
    expect(result.documentCount).toBe(2);
    expect(result.totalSizeBytes).toBeGreaterThan(0);
  });
});
```

**Verification:**
- [ ] Test passes
- [ ] Verifies the exact code path that was broken
- [ ] Prevents regression of 500 error bug

---

#### 2. Add Integration Test for SECURITY DEFINER Functions

**Priority:** HIGH
**Estimated:** 2-3 hours
**Location:** `apps/api/src/infrastructure/persistence/rls/__tests__/public-instruction-set-security-definer.integration.spec.ts`
**Report:** Security Review - MEDIUM #3, Test Review - HIGH #2

**Problem:** New SECURITY DEFINER functions are security-critical but have no test coverage.

**Action:**
Create comprehensive integration test suite following the pattern from `public-link-security-definer.integration.spec.ts`.

**Required Test Cases:**

```typescript
describe('Public Instruction Set SECURITY DEFINER Functions', () => {
  // Test 1: Lookup without RLS context
  it('should find public instruction set by ID WITHOUT RLS context', async () => {
    const results = await prisma.$queryRaw`
      SELECT * FROM lookup_public_instruction_set(${publicSet.id})
    `;
    expect(results).toHaveLength(1);
    expect(results[0].is_public).toBe(true);
  });

  // Test 2: Return empty for non-public sets
  it('should NOT return private instruction sets', async () => {
    const privateSet = await createInstructionSet({ isPublic: false });
    const results = await prisma.$queryRaw`
      SELECT * FROM lookup_public_instruction_set(${privateSet.id})
    `;
    expect(results).toHaveLength(0);
  });

  // Test 3: Only return VERIFIED documents
  it('should only return VERIFIED documents', async () => {
    const set = await createPublicSetWithDocuments([
      { verificationStatus: 'VERIFIED' },
      { verificationStatus: 'UNVERIFIED' },
    ]);
    const docs = await prisma.$queryRaw`
      SELECT * FROM get_public_instruction_set_documents(${set.id})
    `;
    expect(docs).toHaveLength(1); // Only VERIFIED
  });

  // Test 4: SQL Injection protection
  it('should be safe from SQL injection attempts', async () => {
    const maliciousIds = [
      "'; DROP TABLE InstructionSet; --",
      "id' OR '1'='1",
      "id' UNION SELECT * FROM Workspace --",
      "id'; UPDATE InstructionSet SET isPublic=true; --",
    ];
    for (const id of maliciousIds) {
      const results = await prisma.$queryRaw`
        SELECT * FROM lookup_public_instruction_set(${id})
      `;
      expect(results).toHaveLength(0);
    }
    // Verify tables still exist and data unchanged
    const sets = await prismaSuperuser.instructionSet.count();
    expect(sets).toBeGreaterThan(0);
  });

  // Test 5: Workspace isolation
  it('should NOT expose workspace data except workspaceId', async () => {
    const set = await createPublicSet();
    const results = await prisma.$queryRaw`
      SELECT * FROM lookup_public_instruction_set(${set.id})
    `;
    expect(results[0]).toHaveProperty('workspace_id');
    expect(results[0]).not.toHaveProperty('workspace_created_by_id');
  });

  // Test 6: Document isolation
  it('should NOT return documents from other instruction sets', async () => {
    const setA = await createPublicSetWithDocs(['doc1', 'doc2']);
    const setB = await createPublicSetWithDocs(['doc3', 'doc4']);

    const docsA = await prisma.$queryRaw`
      SELECT * FROM get_public_instruction_set_documents(${setA.id})
    `;
    expect(docsA.map(d => d.document_id)).toEqual(['doc1', 'doc2']);
    expect(docsA.map(d => d.document_id)).not.toContain('doc3');
  });

  // Test 7: Empty result for non-public set documents
  it('should return empty documents if instruction set is private', async () => {
    const privateSet = await createInstructionSet({ isPublic: false });
    await addDocuments(privateSet.id, ['doc1', 'doc2']);

    const docs = await prisma.$queryRaw`
      SELECT * FROM get_public_instruction_set_documents(${privateSet.id})
    `;
    expect(docs).toHaveLength(0); // Private set = no docs
  });
});
```

**Verification:**
- [ ] All 7+ test cases pass
- [ ] SQL injection protection verified
- [ ] Workspace isolation verified
- [ ] Document verification filtering verified

---

#### 3. Add Audit Logging for Public Access

**Priority:** HIGH
**Estimated:** 30 minutes
**Location:** `apps/api/src/application/instruction-set/instruction-set.service.ts`
**Report:** Security Review - MEDIUM #1

**Problem:** No audit logging for public instruction set access events. Cannot detect abuse or enumeration attempts.

**Action:**
Add audit logging similar to PublicLink implementation:

```typescript
// In instruction-set.service.ts
async getPublicContent(id: string) {
  this.logger.log({
    event: 'PUBLIC_INSTRUCTION_SET_ACCESS',
    instructionSetId: id,
    timestamp: new Date().toISOString(),
  });

  const set = await this.repository.findByIdPublic(id);

  if (!set) {
    this.logger.warn({
      event: 'PUBLIC_INSTRUCTION_SET_NOT_FOUND',
      instructionSetId: id,
      timestamp: new Date().toISOString(),
    });
    throw new NotFoundException('Instruction set not found');
  }

  this.logger.log({
    event: 'PUBLIC_INSTRUCTION_SET_SERVED',
    instructionSetId: id,
    documentCount: set.documents.length,
    totalSizeBytes: set.totalSizeBytes,
    timestamp: new Date().toISOString(),
  });

  return { /* ... */ };
}
```

**Benefits:**
- Detect abuse (excessive access to public instruction sets)
- Analytics (which public sets are most used)
- Security monitoring (enumeration attempts)
- Compliance (audit trail for data access)

**Verification:**
- [ ] Logs include event type, instructionSetId, timestamp
- [ ] Logs for success and failure scenarios
- [ ] Privacy preserved (no sensitive data in logs)

---

### MEDIUM (should be done next sprint)

#### 4. Refactor Entity Mapping Code (DRY Violation)

**Priority:** MEDIUM
**Estimated:** 1-2 hours
**Location:** `instruction-set.service.ts`
**Report:** Architecture Review - MEDIUM, Code Quality Review - HIGH #1

**Problem:** The same Prisma-to-Entity mapping code is repeated 9 times throughout the service file (150+ lines of duplication).

**Action:**
Extract entity mapping logic to eliminate duplication:

```typescript
// Add private methods to service
private async findOneWithRLS(
  workspaceId: string,
  id: string,
): Promise<InstructionSetEntity | null> {
  return this.prisma.forWorkspace(workspaceId, async (tx) => {
    const data = await tx.instructionSet.findUnique({
      where: { id },
      include: instructionSetInclude, // Already defined in repository
    });
    if (!data) return null;
    return this.mapToEntity(data);
  });
}

private mapToEntity(data: InstructionSetWithDocuments): InstructionSetEntity {
  return InstructionSetEntity.reconstitute({
    id: data.id,
    workspaceId: data.workspaceId,
    name: data.name,
    description: data.description,
    isPublic: data.isPublic,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    documents: data.documents.map(this.mapDocumentToEntity),
  });
}

private mapDocumentToEntity(d: PrismaInstructionSetDocument) {
  return {
    id: d.id,
    instructionSetId: d.instructionSetId,
    documentId: d.documentId,
    order: d.order,
    title: d.document.title,
    content: d.document.content,
    sizeBytes: Buffer.byteLength(d.document.content, 'utf8'),
    fileUrl: d.document.fileUrl,
  };
}
```

**Benefits:**
- Reduces service from ~930 lines to ~700 lines (-25%)
- Single source of truth for entity mapping
- Easier to test (extract method = unit testable)
- Follows SOLID-SRP (one reason to change)

**Verification:**
- [ ] Mapping logic extracted to private methods
- [ ] All 9 occurrences refactored to use shared method
- [ ] Tests still pass
- [ ] File size reduced by ~25%

---

#### 5. Implement Rate Limiting for Public Endpoints

**Priority:** MEDIUM
**Estimated:** 1-2 hours
**Location:** NestJS middleware or nginx config
**Report:** Security Review - MEDIUM #2

**Problem:** No rate limiting on public instruction set endpoints. Potential DoS vulnerability.

**Attack Scenario:**
1. Attacker discovers public instruction set URL: `/s/{uuid}`
2. Sends 10,000 requests/second
3. Database overwhelmed with SECURITY DEFINER function calls
4. Denial of Service for legitimate users

**Action:**
Implement rate limiting (choose one approach):

**Option 1: NestJS Middleware**
```typescript
@Injectable()
export class PublicInstructionSetRateLimitMiddleware implements NestMiddleware {
  private accessCounts = new Map<string, { count: number; resetAt: Date }>();

  use(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id;
    const now = new Date();

    const limit = this.accessCounts.get(id);

    if (limit && limit.resetAt > now) {
      if (limit.count >= 100) { // 100 req/min
        throw new TooManyRequestsException('Rate limit exceeded');
      }
      limit.count++;
    } else {
      this.accessCounts.set(id, {
        count: 1,
        resetAt: new Date(now.getTime() + 60000), // 1 min
      });
    }

    next();
  }
}
```

**Option 2: Nginx Config (Production)**
```nginx
limit_req_zone $arg_id zone=public_instruction_sets:10m rate=100r/m;

location /s/ {
  limit_req zone=public_instruction_sets burst=10;
}
```

**Verification:**
- [ ] Rate limiting implemented
- [ ] Test: 101 requests in 1 min → 429 Too Many Requests
- [ ] Monitor rate limit hits in production

---

#### 6. Document RLS Context Loss Pattern

**Priority:** MEDIUM
**Estimated:** 30 minutes
**Location:** `docs/ecosystem.md` or `docs/testing/patterns.md`
**Report:** Test Review - MEDIUM #2

**Problem:** The specific pattern "RLS context lost after transaction when reloading via repository" is not documented as an anti-pattern.

**Action:**
Add to `docs/ecosystem.md` or create `docs/testing/patterns.md`:

```markdown
### Anti-Pattern: RLS Context Loss After Transaction

❌ **WRONG - Context lost after transaction:**
```typescript
// Transaction sets RLS context
await prisma.forWorkspace(workspaceId, async (tx) => {
  await tx.instructionSet.create({ ... });
});

// Reload via repository - NO RLS context!
const reloaded = await repository.findById(id); // ❌ May fail or return empty
```

✅ **CORRECT - Maintain RLS context:**
```typescript
const reloaded = await prisma.forWorkspace(workspaceId, async (tx) => {
  return tx.instructionSet.findUnique({ where: { id } });
});
```

**Why:** Prisma transactions set `LOCAL` session variables which are cleared after transaction completes.
```

**Verification:**
- [ ] Documentation updated
- [ ] Pattern documented with examples
- [ ] Added to team knowledge base

---

#### 7. Update Documentation

**Priority:** MEDIUM
**Estimated:** 1 hour
**Report:** Documentation Review - HIGH #1, #2; MEDIUM #1, #2

**Required Updates:**

**7.1 Create ADR for SECURITY DEFINER Pattern**
- File: `docs/adr/ADR-2026-01-05-security-definer-pattern.md`
- When to use SECURITY DEFINER vs forWorkspace()
- Pattern for public access endpoints
- Security checklist (isPublic=true, VERIFIED documents only, etc.)

**7.2 Update ecosystem.md**
- Add InstructionSet to Document Context bounded context (lines 88-112)
- Add InstructionSet entities and relationships
- Document public access pattern (SECURITY DEFINER + isPublic + VERIFIED)

**7.3 Update SPEC-001**
- Update Public API row in refactorization table to include InstructionSet functions
- Add `lookup_public_instruction_set()` and `get_public_instruction_set_documents()`

**7.4 Create User Guide**
- File: `docs/user-guides/instruction-sets.md`
- What are instruction sets (document collections for LLM context)
- How to create and manage them
- Public sharing (isPublic flag)
- Token estimation and size limits
- Optimistic locking (concurrent edit protection)

**Verification:**
- [ ] ADR created and reviewed
- [ ] ecosystem.md updated
- [ ] SPEC-001 updated
- [ ] User guide created

---

#### 8. Split Large Service File

**Priority:** MEDIUM
**Estimated:** 3-4 hours
**Location:** `instruction-set.service.ts` (928 lines)
**Report:** Code Quality Review - MEDIUM #1

**Problem:** File exceeds recommended limit (300 lines). Service has multiple responsibilities:
- CRUD operations
- Document management
- Public access
- Response mapping
- URL building

**Action:**
Split into multiple services following Single Responsibility Principle:
- `InstructionSetService` - core CRUD
- `InstructionSetDocumentService` - document operations (add/remove/reorder)
- `PublicInstructionSetService` - public access methods
- Response DTOs in separate mapper class

**Verification:**
- [ ] Services split following SRP
- [ ] Tests updated and passing
- [ ] Each service < 300 lines
- [ ] Clear boundaries between services

---

### LOW (backlog)

#### 9. Add UUID Validation for Public Access

**Priority:** LOW
**Estimated:** 15 minutes
**Location:** `instruction-set.service.ts` or controller
**Report:** Security Review - LOW #1

**Problem:** UUID format not validated before SQL function call. Unnecessary database calls for invalid UUIDs.

**Action:**
Add UUID validation before database call:

```typescript
async getPublicContent(id: string) {
  // Validate UUID format before database call
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new NotFoundException('Instruction set not found');
  }

  const set = await this.repository.findByIdPublic(id);
  // ...
}
```

Or use NestJS validator:
```typescript
@Controller('s')
export class PublicInstructionSetController {
  @Get(':id')
  async getPublicContent(@Param('id', new ParseUUIDPipe()) id: string) {
    // id automatically validated as UUID
  }
}
```

**Verification:**
- [ ] UUID validation added
- [ ] Invalid UUIDs return 404 immediately
- [ ] No database queries for invalid formats

---

#### 10. Add Statement Timeout to SECURITY DEFINER Functions

**Priority:** LOW
**Estimated:** 15 minutes
**Location:** Migration file
**Report:** Security Review - LOW #2

**Problem:** SECURITY DEFINER functions have no timeout. Potential resource exhaustion.

**Action:**
Add timeout to function definitions:

```sql
CREATE OR REPLACE FUNCTION lookup_public_instruction_set(p_id TEXT)
...
SECURITY DEFINER
STABLE
SET statement_timeout = '5s'
AS $$
BEGIN
  -- ...
END;
$$;
```

**Verification:**
- [ ] Timeout added to both functions
- [ ] Test: Long-running query times out
- [ ] Monitor slow queries in production

---

#### 11. Add Repository Method Documentation

**Priority:** LOW
**Estimated:** 15 minutes
**Location:** `instruction-set.repository.impl.ts`
**Report:** Security Review - LOW #3

**Problem:** `findById()` doesn't document RLS requirement. Risk of misuse.

**Action:**
Add JSDoc warning:

```typescript
/**
 * @internal
 * @security REQUIRES RLS context to be set via forWorkspace() or withCurrentUser()
 * @throws If called without RLS context, may return data from wrong workspace
 */
async findById(id: string): Promise<InstructionSetEntity | null>
```

**Verification:**
- [ ] JSDoc added to all repository methods requiring RLS context
- [ ] IDE shows warning when used incorrectly

---

#### 12. Add Migration Comments

**Priority:** LOW
**Estimated:** 15 minutes
**Location:** Migration file
**Report:** Architecture Review - LOW #1; Documentation Review - MEDIUM #2

**Action:**
Add context comments to migration:

```sql
-- Public Instruction Set Lookup Function
-- CONTEXT: Fixes bug where public instruction sets returned no documents.
-- Raw $queryRaw respects RLS policies, so unauthenticated requests get filtered out.
-- This SECURITY DEFINER function bypasses RLS for PUBLIC instruction sets only.
--
-- Pattern: SECURITY DEFINER for public access (ADR-2025-12-28)
-- Similar to lookup_public_link_by_token (migration 20251229100000)
```

**Verification:**
- [ ] Migration includes bug context
- [ ] References ADR and related migrations
- [ ] Explains security model

---

#### 13. Extract Prisma Include Constant

**Priority:** LOW
**Estimated:** 15 minutes
**Location:** `instruction-set.service.ts`
**Report:** Code Quality Review - MEDIUM #2

**Problem:** Same Prisma include object defined inline in multiple methods.

**Action:**
Extract to constant:

```typescript
const INSTRUCTION_SET_INCLUDE = {
  documents: {
    include: {
      document: {
        select: {
          id: true,
          title: true,
          content: true,
          fileUrl: true,
          verificationStatus: true,
          purpose: true,
        },
      },
    },
    orderBy: { order: 'asc' as const },
  },
} as const;
```

**Verification:**
- [ ] Constant extracted
- [ ] All inline occurrences replaced
- [ ] Tests still pass

---

## Acceptance Criteria

Specification is completed when:

### Before Next Release (HIGH Priority)

- [ ] **Integration test for create with documents** (prevents regression of 500 error)
- [ ] **Integration test for SECURITY DEFINER functions** (security-critical)
- [ ] **Audit logging added** (security monitoring)

### Next Sprint (MEDIUM Priority)

- [ ] **Entity mapping refactored** (code quality, DRY)
- [ ] **Rate limiting implemented** (DoS prevention)
- [ ] **Documentation updated** (ADR, ecosystem.md, SPEC-001, user guide)
- [ ] **RLS context loss pattern documented** (team knowledge)

### Backlog (LOW Priority)

- [ ] Service file split (SRP)
- [ ] UUID validation added
- [ ] Statement timeouts configured
- [ ] Repository methods documented
- [ ] Migration comments enhanced
- [ ] Prisma include constant extracted

### Build & Tests

- [x] Build passes (`pnpm build` - success)
- [x] TypeScript compiles (0 errors in API code)
- [x] Unit tests pass (299/299)
- [ ] Integration tests pass (including new SECURITY DEFINER tests)

---

## Architecture References

- [Ecosystem - RLS Architecture](../../docs/ecosystem.md#rls-context-propagation)
- [SPEC-001: Row Level Security](./SPEC-001-row-level-security.md)
- [SPEC: RLS SECURITY DEFINER Fixes](./2025-12-29-00-27-rls-security-definer-fixes.md)
- [ADR-2025-12-28: RLS Workspace Context Refactor](../adr/ADR-2025-12-28-rls-workspace-context-refactor.md)

---

## Summary of Findings

### Critical Issues

**None identified.** Both bugs have been fixed correctly following established patterns.

### High Priority (3 tasks, ~5 hours)

1. **Integration test for create with documents** (2h) - Prevents regression of 500 error bug
2. **Integration test for SECURITY DEFINER functions** (2-3h) - Security-critical code coverage
3. **Audit logging** (30min) - Security monitoring and compliance

### Medium Priority (5 tasks, ~7.5 hours)

1. **Refactor entity mapping** (1-2h) - Code quality, DRY violation
2. **Rate limiting** (1-2h) - DoS prevention
3. **Document RLS context loss** (30min) - Team knowledge
4. **Update documentation** (1h) - ADR, ecosystem.md, SPEC-001, user guide
5. **Split service file** (3-4h) - SRP, maintainability

### Low Priority (5 tasks, ~1.5 hours - backlog)

1. UUID validation (15min)
2. Statement timeouts (15min)
3. Repository documentation (15min)
4. Migration comments (15min)
5. Extract Prisma constant (15min)

---

## Estimation

| Priority | Tasks | Time Estimated |
|----------|-------|----------------|
| HIGH     | 3 tasks | ~5 hours |
| MEDIUM   | 5 tasks | ~7.5 hours |
| LOW      | 5 tasks | ~1.5 hours (backlog) |
| **TOTAL (before release)** | **HIGH** | **~5 hours** |
| **TOTAL (next sprint)** | **HIGH + MEDIUM** | **~12.5 hours** |
| **TOTAL (all)** | **13 tasks** | **~14 hours** |

---

## Review History

### 2026-01-05 - Initial Specification

Created from code review reports:
- Security Review: APPROVED FOR MERGE with conditions (score 8/10)
- Architecture Review: APPROVED - HIGH QUALITY (excellent implementation)
- Test Review: Overall 65/100 (missing integration tests)
- Code Quality Review: APPROVE with Follow-up Task (DRY violation)
- Documentation Review: MEDIUM - Documentation Lagging Behind Implementation

**Key findings:**
- Both bugs correctly fixed following RLS patterns
- SECURITY DEFINER implementation is excellent (defense in depth)
- Critical gap: No integration tests for the exact broken code paths
- Code quality: Significant duplication in entity mapping (9x repeated)
- Documentation: InstructionSet feature missing from architecture docs

**Status:** Fixed code is correct and safe to merge. Integration tests and documentation updates are the main follow-up tasks.

---

## Positive Aspects

### What Was Done Right

1. **Root Cause Analysis:** Correctly identified RLS context loss after transaction commits
2. **Pattern Reuse:** Followed established SECURITY DEFINER pattern from PublicLink
3. **Consistency:** Migrated PublicLinkService to workspace-based RLS (architectural alignment)
4. **Security:** Defense in depth (isPublic check, VERIFIED filter, anti-enumeration)
5. **Clean Architecture:** Repository abstracts RLS bypass, domain stays pure
6. **Type Safety:** Strong typing throughout, no `any` types
7. **ADR Compliance:** Perfect compliance with ADR-2025-12-28

### Security Score: 8/10

- SQL Injection: LOW risk (parameterized queries)
- Broken Access Control: LOW risk (defense in depth)
- Data Exposure: LOW risk (only verified public data)
- DoS: MEDIUM risk (no rate limiting - mitigate in next sprint)
- Enumeration: LOW risk (UUID randomness + 404 for private sets)

---

## Next Steps

1. **Immediate (Before Release):**
   - Add integration test for create with documents
   - Add integration test for SECURITY DEFINER functions
   - Add audit logging

2. **Short-term (Next Sprint):**
   - Refactor entity mapping code
   - Implement rate limiting
   - Update documentation (ADR, ecosystem.md, SPEC-001)

3. **Long-term (Backlog):**
   - Split service file (SRP)
   - Add remaining LOW priority improvements
