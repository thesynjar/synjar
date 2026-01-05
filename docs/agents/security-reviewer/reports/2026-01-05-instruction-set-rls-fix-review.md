# Security Review Report - 2026-01-05

## Security Review Results

### Context

**Analyzed modules:**
- Public Instruction Set Access (new feature)
- Row Level Security (RLS) bypass implementation
- SECURITY DEFINER SQL functions
- Document verification filtering

**Reviewed files:**
- `apps/api/prisma/migrations/20260105100000_add_public_instruction_set_access/migration.sql`
- `apps/api/src/application/instruction-set/instruction-set.service.ts`
- `apps/api/src/infrastructure/persistence/repositories/instruction-set.repository.impl.ts`

**Related documents read:**
- `docs/ecosystem.md` - RLS architecture, Public API patterns, SECURITY DEFINER best practices
- `docs/specifications/2025-12-29-00-27-rls-security-definer-fixes.md` - Previous SECURITY DEFINER implementation review
- `apps/api/prisma/migrations/20251229100000_add_public_link_token_lookup_function/migration.sql` - Reference implementation

**Change context:**
Two bugs fixed:
1. Instruction set creation failing with 500 error when documents were added (RLS context lost after transaction)
2. Public instruction set access not working (raw query didn't bypass RLS, needed SECURITY DEFINER functions)

---

## OWASP Top 10 Analysis

### 1. Injection (SQL Injection)

**Risk Level:** LOW (Parameterized queries used)

**Finding:** The SECURITY DEFINER functions use parameterized queries via Prisma's `$queryRaw` with template literals:

```typescript
const setRows = await this.prisma.$queryRaw<Array<...>>`
  SELECT * FROM lookup_public_instruction_set(${id})
`;
```

**SQL Function Implementation:**
```sql
CREATE OR REPLACE FUNCTION lookup_public_instruction_set(p_id TEXT)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ... FROM "InstructionSet" is_
  WHERE is_.id = p_id AND is_."isPublic" = true;
END;
$$;
```

**Analysis:**
- Prisma's `$queryRaw` template literals automatically parameterize inputs (protection against SQL injection)
- The SQL function receives `p_id` as a parameter, not concatenated into the query string
- PostgreSQL's plpgsql parameterization prevents injection

**Tested Attack Vectors (extrapolated from reference implementation):**
- `'; DROP TABLE InstructionSet; --`
- `id' OR '1'='1`
- `id' UNION SELECT * FROM Workspace --`

**Expected Result:** All should return empty results, not execute malicious code.

**Recommendation:** Add integration tests similar to public-link-security-definer.integration.spec.ts:
```typescript
it('should be safe from SQL injection attempts', async () => {
  const maliciousIds = [
    "'; DROP TABLE InstructionSet; --",
    "id' OR '1'='1",
    "id' UNION SELECT * FROM Workspace --",
  ];
  for (const id of maliciousIds) {
    const result = await prisma.$queryRaw`SELECT * FROM lookup_public_instruction_set(${id})`;
    expect(result).toHaveLength(0);
  }
  // Verify tables still exist
  const sets = await prismaSuperuser.instructionSet.count();
  expect(sets).toBeGreaterThanOrEqual(0);
});
```

---

### 2. Broken Access Control

**Risk Level:** MEDIUM (Properly mitigated with defense-in-depth)

#### 2.1 Public Access Authorization Model

**Finding:** Public instruction sets use `isPublic` boolean flag authorization model (similar to PublicLink pattern).

**Security Controls:**

1. **Database-level validation** (SECURITY DEFINER function):
```sql
WHERE is_.id = p_id AND is_."isPublic" = true
```

2. **Document verification filtering** (SECURITY DEFINER function):
```sql
WHERE isd."instructionSetId" = p_instruction_set_id
  AND d."verificationStatus" = 'VERIFIED'
```

3. **RLS enforcement for authenticated operations:**
```sql
CREATE POLICY "instruction_set_select" ON "InstructionSet"
  FOR SELECT
  USING ("workspaceId" = current_setting('app.current_workspace_id', true));
```

**Authorization Model:**
- PUBLIC access: Only if `isPublic=true` AND documents are `VERIFIED`
- AUTHENTICATED access: Only if user is workspace member (via RLS)

**Positive aspects:**
- Defense in depth: Multiple layers of authorization (database + application)
- Principle of least privilege: Public access restricted to verified documents only
- Clear separation: Public vs authenticated access paths

**Potential Issues:**

1. **Enumeration attack possible** - User can guess UUID to check if instruction set exists:
   - Request `/s/non-existent-uuid` → 404 Not Found
   - Request `/s/private-set-uuid` → 404 Not Found (indistinguishable)

   **Mitigation:** Already implemented - returns 404 for both non-existent and private sets:
   ```typescript
   if (!set) {
     throw new NotFoundException('Instruction set not found');
   }
   ```

2. **Information disclosure through timing** - Response time difference between:
   - Non-existent UUID (fast lookup)
   - Existing but private UUID (slow lookup with JOIN)

   **Risk:** LOW - UUIDs are cryptographically random, enumeration is impractical
   **Recommendation:** Consider constant-time response (always query documents even if set not found)

#### 2.2 RLS Context Loss Bug (FIXED)

**Original Issue:** RLS context lost after transaction in `create()` method.

**Root Cause:**
```typescript
// BAD - loses RLS context after first transaction
await this.repository.findById(savedEntity.id);
```

**Fix Applied:**
```typescript
// GOOD - maintains RLS context
const reloaded = await this.prisma.forWorkspace(workspaceId, async (tx) => {
  const data = await tx.instructionSet.findUnique({ where: { id: savedEntity.id } });
  // ... proper mapping
});
```

**Security Impact:**
- Before: Potential data leak if `findById()` bypassed RLS (unclear from code review)
- After: RLS explicitly enforced via `forWorkspace(workspaceId)`

**Verification:** Ensure `repository.findById()` NEVER bypasses RLS:
```typescript
async findById(id: string): Promise<InstructionSetEntity | null> {
  const data = await this.prisma.instructionSet.findUnique({
    where: { id },
    include: instructionSetInclude,
  });
  // ⚠️ WARNING: This assumes RLS context is already set!
  // Should only be called from within forWorkspace() or withCurrentUser()
}
```

**Recommendation:** Add JSDoc warning:
```typescript
/**
 * @internal
 * @security REQUIRES RLS context to be set via forWorkspace() or withCurrentUser()
 * @throws If called without RLS context, may return data from wrong workspace
 */
async findById(id: string): Promise<InstructionSetEntity | null>
```

---

### 3. Sensitive Data Exposure

**Risk Level:** LOW

**Finding:** Documents contain potentially sensitive content, but proper access controls are in place.

**Data Classification:**
- Instruction set metadata (name, description) - PUBLIC if `isPublic=true`
- Document content - PUBLIC only if `verificationStatus=VERIFIED`
- Unverified documents - PRIVATE (excluded from public access)

**Security Controls:**
1. **Verification status filtering:**
   ```sql
   AND d."verificationStatus" = 'VERIFIED'
   ```

2. **Explicit column selection** (prevents accidental disclosure):
   ```sql
   SELECT
     isd.id::TEXT,
     isd."instructionSetId"::TEXT,
     isd."documentId"::TEXT,
     isd."order" as doc_order,
     d.title,
     d.content,
     d."fileUrl" as file_url
   -- No sensitive fields like createdById, embeddings, etc.
   ```

**Positive aspects:**
- Only verified documents are publicly accessible
- Field-level access control (SELECT only necessary columns)
- No workspace-identifying information leaked (workspace_id returned but already accessible via public set)

**Recommendation:** Consider adding audit logging for public access:
```typescript
this.logger.log({
  event: 'PUBLIC_INSTRUCTION_SET_ACCESS',
  instructionSetId: id,
  documentCount: set.documents.length,
  timestamp: new Date().toISOString(),
});
```

---

### 4. Security Misconfigurations

**Risk Level:** LOW

#### 4.1 SECURITY DEFINER Function Configuration

**Finding:** SECURITY DEFINER functions follow PostgreSQL best practices.

**Configuration Review:**

1. **Function Volatility:** `STABLE` (correct for read-only functions)
   ```sql
   SECURITY DEFINER
   STABLE
   ```
   - `STABLE` = function result doesn't change within a query
   - Allows query optimization
   - Correct classification for lookup functions

2. **Permission Grants:** `GRANT EXECUTE ... TO PUBLIC`
   ```sql
   GRANT EXECUTE ON FUNCTION lookup_public_instruction_set(TEXT) TO PUBLIC;
   GRANT EXECUTE ON FUNCTION get_public_instruction_set_documents(TEXT) TO PUBLIC;
   ```
   - **Justified:** Required for unauthenticated public access
   - **Safe:** Functions implement authorization logic internally (isPublic check)
   - Consistent with `lookup_public_link_by_token()` pattern

3. **Function Naming:** Clear and descriptive
   - `lookup_public_instruction_set` (metadata lookup)
   - `get_public_instruction_set_documents` (document retrieval)
   - Naming clearly indicates public access scope

**Missing Configuration (LOW priority):**

1. **Statement Timeout:** No timeout configured for SECURITY DEFINER functions
   ```sql
   -- Recommendation: Add timeout to prevent DoS
   CREATE OR REPLACE FUNCTION lookup_public_instruction_set(p_id TEXT)
   ...
   SET statement_timeout = '5s'
   AS $$
   ```

2. **Search Path:** Not explicitly set (relies on default)
   ```sql
   -- Recommendation: Lock search path to prevent schema poisoning
   SET search_path = public, pg_temp
   ```

---

### 5. Insufficient Logging & Monitoring

**Risk Level:** MEDIUM

**Finding:** No audit logging for public instruction set access.

**Current State:**
- No logging in `getPublicContent()` method
- No logging in `getRawContent()` method
- No logging in SECURITY DEFINER functions

**Comparison with PublicLink:**
Reference implementation has audit logging:
```typescript
this.logger.debug({
  event: 'SECURITY_DEFINER_CALL',
  function: 'lookup_public_link_by_token',
  tokenPrefix: token.substring(0, 8) + '...',
  timestamp: new Date().toISOString(),
});
```

**Recommendation:** Add audit logging:

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

---

### 6. Missing Rate Limiting

**Risk Level:** MEDIUM

**Finding:** No rate limiting on public instruction set endpoints.

**Attack Scenario:**
1. Attacker discovers public instruction set URL: `/s/{uuid}`
2. Sends 10,000 requests/second to `/s/{uuid}`
3. Database overwhelmed with SECURITY DEFINER function calls
4. Denial of Service for legitimate users

**Comparison:** PublicLink has same issue (noted in SPEC-2025-12-29 as LOW priority backlog item).

**Recommendation:** Implement rate limiting (same as PublicLink):

```typescript
// NestJS middleware
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

Or nginx config (production):
```nginx
limit_req_zone $arg_id zone=public_instruction_sets:10m rate=100r/m;

location /s/ {
  limit_req zone=public_instruction_sets burst=10;
}
```

---

### 7. Input Validation

**Risk Level:** LOW

**Finding:** UUID format not validated before SQL function call.

**Current Implementation:**
```typescript
async getPublicContent(id: string) {
  const set = await this.repository.findByIdPublic(id);
  // 'id' passed directly to SQL function without validation
}
```

**SQL Function:**
```sql
WHERE is_.id = p_id
-- No UUID format validation
```

**Risk Analysis:**
- PostgreSQL will fail to match non-UUID strings (returns empty result, not error)
- Parameterized query prevents SQL injection
- **Impact:** Unnecessary database calls for invalid UUIDs

**Recommendation:** Add UUID validation (defense in depth):

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

Or use NestJS validator in DTO:
```typescript
@Controller('s')
export class PublicInstructionSetController {
  @Get(':id')
  async getPublicContent(@Param('id', new ParseUUIDPipe()) id: string) {
    // id automatically validated as UUID
  }
}
```

---

## Test Coverage

### Missing Tests

**Critical:** Integration tests for SECURITY DEFINER functions

Based on reference implementation (`public-link-security-definer.integration.spec.ts`), the following tests are **REQUIRED**:

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
    const privateSets = await prismaSuperuser.instructionSet.count({
      where: { isPublic: false }
    });
    expect(privateSets).toBeGreaterThan(0); // Not changed to public
  });

  // Test 5: Workspace isolation
  it('should NOT expose workspace data except workspaceId', async () => {
    const set = await createPublicSet();
    const results = await prisma.$queryRaw`
      SELECT * FROM lookup_public_instruction_set(${set.id})
    `;
    expect(results[0]).toHaveProperty('workspace_id');
    expect(results[0]).not.toHaveProperty('workspace_created_by_id');
    // Only minimal workspace info exposed
  });

  // Test 6: Document content security
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

**Estimated Effort:** 2-3 hours

---

## Positive Security Aspects

### 1. Consistent Architecture Pattern

The implementation follows the established SECURITY DEFINER pattern from PublicLink:
- Separate functions for metadata lookup and data retrieval
- Parameterized queries throughout
- STABLE function volatility
- Explicit column selection

### 2. Defense in Depth

Multiple layers of security:
1. Database-level: RLS policies (workspace isolation)
2. Database-level: SECURITY DEFINER authorization logic (isPublic check)
3. Database-level: Document verification filtering (VERIFIED only)
4. Application-level: Error handling (404 for both non-existent and private)

### 3. Principle of Least Privilege

- Public functions only return PUBLIC data (isPublic=true)
- Only VERIFIED documents exposed (not UNVERIFIED drafts)
- Minimal workspace metadata exposed (only workspaceId, not createdById)

### 4. RLS Context Preservation

The fix for Bug #1 correctly maintains RLS context:
```typescript
const reloaded = await this.prisma.forWorkspace(workspaceId, async (tx) => {
  const data = await tx.instructionSet.findUnique({ where: { id: savedEntity.id } });
  // ... proper entity reconstruction within RLS context
});
```

This prevents the RLS context loss that could lead to data leakage.

### 5. Verification Status Enforcement

Only VERIFIED documents are publicly accessible - prevents accidental exposure of draft/unverified content:
```sql
AND d."verificationStatus" = 'VERIFIED'
```

---

## Summary of Findings

### Critical Issues

**None identified.** The implementation follows security best practices and the established SECURITY DEFINER pattern.

### High Priority

**None identified.** Authorization model is sound with proper defense-in-depth.

### Medium Priority

1. **Missing Audit Logging**
   - No logging for public access events
   - Cannot detect abuse or enumeration attempts
   - How to fix: Add audit logging similar to PublicLink implementation (see section 5)

2. **Missing Rate Limiting**
   - No rate limiting on public endpoints
   - Potential DoS vulnerability
   - How to fix: Implement middleware-based rate limiting (see section 6)

3. **Missing Integration Tests**
   - No tests for SECURITY DEFINER functions
   - Cannot verify SQL injection protection
   - How to fix: Create test suite similar to `public-link-security-definer.integration.spec.ts` (see Test Coverage section)

### Low Priority

1. **Missing Input Validation**
   - UUID format not validated before SQL call
   - Unnecessary database calls for invalid inputs
   - How to fix: Add UUID validation or use `ParseUUIDPipe` (see section 7)

2. **Missing Statement Timeout**
   - SECURITY DEFINER functions have no timeout
   - Potential resource exhaustion
   - How to fix: Add `SET statement_timeout = '5s'` to function definitions

3. **Repository Method Documentation**
   - `findById()` doesn't document RLS requirement
   - Risk of misuse (calling without RLS context)
   - How to fix: Add JSDoc warning (see section 2.2)

---

## Recommendations

### Immediate Actions (Before Merge)

1. **Add Integration Tests** (2-3 hours)
   - Create `apps/api/src/infrastructure/persistence/rls/__tests__/public-instruction-set-security-definer.integration.spec.ts`
   - Test all scenarios: SQL injection, workspace isolation, verification filtering
   - Ensure 100% coverage of SECURITY DEFINER functions

2. **Add Audit Logging** (30 minutes)
   - Log public access events (access, not found, served)
   - Include instructionSetId, documentCount, timestamp
   - Follow pattern from PublicLink implementation

### Short-term Actions (Next Sprint)

3. **Implement Rate Limiting** (1-2 hours)
   - Middleware-based rate limiting (100 req/min per instruction set)
   - Or nginx configuration for production
   - Monitor rate limit hits

4. **Add Input Validation** (15 minutes)
   - UUID format validation before database call
   - Use `ParseUUIDPipe` in controller
   - Return 404 for invalid format (not 500)

### Long-term Improvements (Backlog)

5. **Statement Timeout** (15 minutes)
   - Add `SET statement_timeout = '5s'` to SECURITY DEFINER functions
   - Prevent long-running queries

6. **Repository Documentation** (15 minutes)
   - Add JSDoc to `findById()` explaining RLS requirement
   - Prevent misuse in future development

7. **Search Path Locking** (15 minutes)
   - Add `SET search_path = public, pg_temp` to SECURITY DEFINER functions
   - Prevent schema poisoning attacks

---

## Final Verdict

**APPROVED FOR MERGE** with conditions:

1. MUST add integration tests before merge (MEDIUM priority #3)
2. SHOULD add audit logging before merge (MEDIUM priority #1)
3. SHOULD implement rate limiting in next sprint (MEDIUM priority #2)

**Security Score: 8/10**

The implementation is secure and follows established patterns. The main concerns are operational (logging, rate limiting) rather than fundamental security flaws. The SECURITY DEFINER approach is correctly applied with proper authorization logic and defense in depth.

**Risk Assessment:**
- **SQL Injection:** LOW (parameterized queries)
- **Broken Access Control:** LOW (defense in depth with isPublic + verification filtering)
- **Data Exposure:** LOW (only verified public data)
- **DoS:** MEDIUM (no rate limiting - mitigate in next sprint)
- **Enumeration:** LOW (UUID randomness + 404 for private sets)

---

## References

- [SPEC-001: Row Level Security](../../specifications/SPEC-001-row-level-security.md)
- [SPEC-2025-12-29: RLS SECURITY DEFINER Fixes](../../specifications/2025-12-29-00-27-rls-security-definer-fixes.md)
- [Ecosystem Documentation](../../ecosystem.md#public-api-context)
- [Public Link SECURITY DEFINER Implementation](../../../apps/api/prisma/migrations/20251229100000_add_public_link_token_lookup_function/migration.sql)
- [Public Link Integration Tests](../../../apps/api/src/infrastructure/persistence/rls/__tests__/public-link-security-definer.integration.spec.ts)

---

**Review Date:** 2026-01-05
**Reviewer:** Security Reviewer Agent (Claude Opus 4.5)
**Status:** APPROVED WITH CONDITIONS
