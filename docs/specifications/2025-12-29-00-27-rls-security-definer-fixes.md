# [2025-12-29] RLS SECURITY DEFINER Function - Security Fixes & Documentation Updates

## Status

- [x] CRITICAL #1 - SQL function isActive/expiresAt validation ✅ DONE
- [x] CRITICAL #2 - Remove updated_at field ✅ DONE
- [x] CRITICAL #3 - Update vulnerable dependencies ✅ ANALYZED (transitive deps, DEFERRED)
- [x] HIGH #4 - Integration tests ✅ DONE (12/12 passing)
- [x] MEDIUM #5 - Update ecosystem.md ✅ DONE
- [x] MEDIUM #6 - Add change table to SPEC-001 ✅ DONE
- [x] MEDIUM #9 - Add audit logging ✅ DONE
- [ ] LOW tasks - Backlog

## Kontekst

Specyfikacja powstała na podstawie code review z dnia 2025-12-29.
Dotyczy usunięcia `withoutRls()` z PrismaService i zastąpienia go SQL SECURITY DEFINER function `lookup_public_link_by_token()`.

**Kontekst techniczny:**
- Poprzednia implementacja: `withoutRls()` - dangerous method, bypasował WSZYSTKIE RLS policies
- Nowa implementacja: SQL SECURITY DEFINER function - bezpieczniejszy, ograniczony scope
- Zmiana zgodna z ADR-2025-12-28-rls-workspace-context-refactor.md

## Powiązane raporty

- [Architecture Review](../../docs/agents/architecture-reviewer/reports/2025-12-29-10-00-architecture-review.md)
- [Test Review](../../docs/agents/test-reviewer/reports/2025-12-29-00-23-test-review.md)
- [Code Quality Review](../../docs/agents/code-quality-reviewer/reports/2025-12-29-00-22-code-quality-review.md)
- [Documentation Review](../../docs/agents/documentation-reviewer/reports/2025-12-29-00-22-documentation-review.md)
- [Migration Review](../../docs/agents/migration-reviewer/reports/2025-12-29-00-22-migration-review.md)

## Powiązane specyfikacje i ADR

- [SPEC-001: Row Level Security](./SPEC-001-row-level-security.md)
- [SPEC: RLS Per-Workspace Refactor](./2025-12-28-rls-per-workspace-refactor.md)
- [ADR-2025-12-28: RLS Workspace Context Refactor](../adr/ADR-2025-12-28-rls-workspace-context-refactor.md)

---

## Zadania do wykonania

### 🔴 CRITICAL (blokuje deploy)

#### 1. ✅ DONE - Naprawić SQL function - dodać walidację isActive/expiresAt

**Priorytet:** CRITICAL
**Lokalizacja:** `community/apps/api/prisma/migrations/20251229110000_fix_public_link_token_lookup_function/migration.sql`
**Raport:** Migration Review - MUST item #1

**Problem:**
Funkcja `lookup_public_link_by_token()` zwraca linki niezależnie od statusu (`isActive`) i czasu wygaśnięcia (`expiresAt`). To security hole - nieaktywne i wygasłe linki są dostępne przez public API.

**Rozwiązanie:**
Utworzono nową migrację `20251229110000_fix_public_link_token_lookup_function` która dodaje walidację w funkcji SQL:

```sql
WHERE pl.token = p_token
  AND pl."isActive" = true
  AND (pl."expiresAt" IS NULL OR pl."expiresAt" > NOW());
```

**Weryfikacja:**
- [x] Test: Invalid token zwraca empty result
- [x] Test: Inactive link (isActive=false) zwraca empty result
- [x] Test: Expired link (expiresAt < NOW) zwraca empty result
- [x] Test: Valid active link zwraca dane

**Completed:** 2025-12-29

---

#### 2. ✅ DONE - Naprawić SQL function - usunąć pole updated_at

**Priorytet:** CRITICAL
**Lokalizacja:** `community/apps/api/prisma/migrations/20251229110000_fix_public_link_token_lookup_function/migration.sql`
**Raport:** Migration Review - MUST item #2

**Problem:**
Funkcja zwraca `updated_at TIMESTAMPTZ` w definicji RETURNS TABLE, ale tabela `PublicLink` nie ma tego pola w schemacie Prisma.

**Rozwiązanie:**
- Zweryfikowano schema.prisma - PublicLink NIE MA pola updatedAt
- Usunięto `updated_at` z definicji funkcji w nowej migracji
- Zaktualizowano repository mapping w `public-link.repository.impl.ts`

**Weryfikacja:**
- [x] Sprawdź schema.prisma - PublicLink nie ma pola updatedAt
- [x] Usunięto z funkcji SQL
- [x] Zaktualizowano repository mapping
- [x] Test: Funkcja zwraca wszystkie pola bez błędów

**Completed:** 2025-12-29

---

#### 3. ⚠️ DEFERRED - Update vulnerable dependencies

**Priorytet:** CRITICAL → DEFERRED
**Lokalizacja:** `package.json` files
**Raport:** Code Quality Review (pre-existing warnings)

**Problem:**
9 vulnerabilities found (2 low, 4 moderate, 3 high) - wszystkie w transitive dependencies.

**Analiza (2025-12-29):**
```
pnpm audit results:
- html-minifier <=4.0.0 (HIGH) - no patch available, via @nestjs-modules/mailer → mjml
- glob 10.2.0-10.4.x (HIGH) - patched >=10.5.0, via @nestjs-modules/mailer → mjml
- tmp <=0.2.3 (MODERATE) - patched >=0.2.4, via @nestjs/cli → inquirer
- nodemailer <=7.0.10 (LOW) - patched >=7.0.11, via @nestjs-modules/mailer → preview-email
```

**Status:** DEFERRED - wymaga:
1. Upgrade @nestjs/cli 10.x → 11.x (major version, breaking changes possible)
2. Wait for @nestjs-modules/mailer to update mjml dependencies
3. Or: replace mjml with alternative email templating

**Risk assessment:**
- html-minifier ReDoS: LOW risk - only affects email template generation, not user input
- glob CLI injection: LOW risk - CLI not exposed to users
- tmp race condition: LOW risk - dev dependency only
- nodemailer DoS: LOW risk - addressparser only

**Recommended action:** Create separate issue for dependency upgrade sprint.

**Note:** Te vulnerabilities NIE BLOKUJĄ deploy SECURITY DEFINER changes - są w niezwiązanych dependencies.

---

### 🟠 HIGH (przed merge)

#### 4. ✅ DONE - Dodać integration test dla lookup_public_link_by_token()

**Priorytet:** HIGH
**Lokalizacja:** `community/apps/api/src/infrastructure/persistence/rls/__tests__/public-link-security-definer.integration.spec.ts`
**Raport:** Test Review - H1, Architecture Review - MEDIUM

**Rozwiązanie:**
Utworzono kompletny zestaw integration testów (12 test cases) weryfikujących:
- Token lookup bez RLS context
- Walidację isActive (inactive links zwracają empty)
- Walidację expiresAt (expired links zwracają empty, future/null OK)
- Workspace isolation (token A nie pokazuje workspace B)
- SQL injection protection (7 malicious payloads)

**Test Results:** ✅ PASS (12/12 tests passing)

**Akcja:**
Utworzyć integration test file z następującymi testami:

```typescript
describe('Public Link SECURITY DEFINER Function', () => {
  let prisma: PrismaClient;
  let prismaSuperuser: PrismaClient; // For setup/teardown
  let workspaceA: Workspace;
  let workspaceB: Workspace;
  let publicLinkA: PublicLink;
  let publicLinkB: PublicLink;

  beforeEach(async () => {
    // Setup: Create 2 workspaces with public links
    workspaceA = await prismaSuperuser.workspace.create({...});
    workspaceB = await prismaSuperuser.workspace.create({...});

    publicLinkA = await prismaSuperuser.publicLink.create({
      data: {
        workspaceId: workspaceA.id,
        token: 'valid-token-a-64-chars-hex-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        isActive: true,
        expiresAt: null,
      }
    });

    publicLinkB = await prismaSuperuser.publicLink.create({
      data: {
        workspaceId: workspaceB.id,
        token: 'valid-token-b-64-chars-hex-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        isActive: true,
        expiresAt: null,
      }
    });
  });

  afterEach(async () => {
    // Cleanup using superuser
    await prismaSuperuser.publicLink.deleteMany({
      where: { id: { in: [publicLinkA?.id, publicLinkB?.id].filter(Boolean) } }
    });
    await prismaSuperuser.workspace.deleteMany({
      where: { id: { in: [workspaceA?.id, workspaceB?.id].filter(Boolean) } }
    });
  });

  it('should find public link by valid token WITHOUT RLS context', async () => {
    // CRITICAL: No RLS context set (simulates unauthenticated request)
    const results = await prisma.$queryRaw<Array<{
      id: string;
      workspace_id: string;
      token: string;
      is_active: boolean;
      expires_at: Date | null;
      workspace_name: string;
    }>>`
      SELECT * FROM lookup_public_link_by_token(${publicLinkA.token})
    `;

    expect(results).toHaveLength(1);
    expect(results[0].token).toBe(publicLinkA.token);
    expect(results[0].workspace_id).toBe(workspaceA.id);
  });

  it('should return empty for invalid token', async () => {
    const results = await prisma.$queryRaw<Array<any>>`
      SELECT * FROM lookup_public_link_by_token(${'invalid-token-does-not-exist'})
    `;

    expect(results).toHaveLength(0);
  });

  it('should return workspace data joined correctly', async () => {
    const results = await prisma.$queryRaw<Array<{
      workspace_name: string;
      workspace_created_by_id: string;
    }>>`
      SELECT * FROM lookup_public_link_by_token(${publicLinkA.token})
    `;

    expect(results[0].workspace_name).toBe(workspaceA.name);
    expect(results[0].workspace_created_by_id).toBe(workspaceA.createdById);
  });

  it('should NOT expose other workspaces links', async () => {
    // Verify function only returns requested token, not all links
    const resultsA = await prisma.$queryRaw<Array<{ workspace_id: string }>>`
      SELECT * FROM lookup_public_link_by_token(${publicLinkA.token})
    `;

    expect(resultsA).toHaveLength(1);
    expect(resultsA[0].workspace_id).toBe(workspaceA.id);

    // Should NOT see workspace B data when querying token A
    expect(resultsA[0].workspace_id).not.toBe(workspaceB.id);
  });

  it('should NOT return inactive links (after CRITICAL fix #1)', async () => {
    // Create inactive link
    const inactiveLink = await prismaSuperuser.publicLink.create({
      data: {
        workspaceId: workspaceA.id,
        token: 'inactive-token-64-chars-hex-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        isActive: false,
      }
    });

    const results = await prisma.$queryRaw`
      SELECT * FROM lookup_public_link_by_token(${inactiveLink.token})
    `;

    // After fix: Should return empty (isActive validation in SQL)
    expect(results).toHaveLength(0);

    // Cleanup
    await prismaSuperuser.publicLink.delete({ where: { id: inactiveLink.id } });
  });

  it('should NOT return expired links (after CRITICAL fix #1)', async () => {
    // Create expired link
    const expiredLink = await prismaSuperuser.publicLink.create({
      data: {
        workspaceId: workspaceA.id,
        token: 'expired-token-64-chars-hex-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        isActive: true,
        expiresAt: new Date('2020-01-01'), // Past date
      }
    });

    const results = await prisma.$queryRaw`
      SELECT * FROM lookup_public_link_by_token(${expiredLink.token})
    `;

    // After fix: Should return empty (expiresAt validation in SQL)
    expect(results).toHaveLength(0);

    // Cleanup
    await prismaSuperuser.publicLink.delete({ where: { id: expiredLink.id } });
  });

  it('should be safe from SQL injection attempts', async () => {
    const maliciousTokens = [
      "'; DROP TABLE PublicLink; --",
      "token' OR '1'='1",
      "token' UNION SELECT * FROM Workspace --",
    ];

    for (const token of maliciousTokens) {
      const results = await prisma.$queryRaw`
        SELECT * FROM lookup_public_link_by_token(${token})
      `;

      // Should return empty, not execute injection
      expect(results).toHaveLength(0);
    }

    // Verify tables still exist
    const workspaces = await prismaSuperuser.workspace.count();
    expect(workspaces).toBeGreaterThan(0);
  });
});
```

**Weryfikacja:**
- [ ] Wszystkie testy przechodzą
- [ ] Coverage dla SECURITY DEFINER function
- [ ] SQL injection prevention zweryfikowany
- [ ] Workspace isolation zweryfikowany

**Estimated:** 1h

---

### 🟡 MEDIUM (następna iteracja)

#### 5. ✅ DONE - Zaktualizować ecosystem.md - Public API Flow diagram

**Priorytet:** MEDIUM
**Lokalizacja:** `community/docs/ecosystem.md` lines 40, 128, 228-268
**Raport:** Documentation Review - HIGH

**Rozwiązanie (2025-12-29):**
Zaktualizowano wszystkie sekcje ecosystem.md:
- Line 40: "RLS bypass" → "SECURITY DEFINER"
- Lines 127-129: Nowe infrastructure (SECURITY DEFINER function + forWorkspace)
- Lines 228-268: Nowy diagram "Public API Flow (SECURITY DEFINER)"
- Lines 460-464: Note about withoutRls() removal
- Lines 502-528: Pattern 3 update
- Lines 551-565: Table and best practices update

**Akcja:**
Zaktualizować sekcje:

1. **Line 40** - Zmienić:
```markdown
# Zamiast:
│ - RLS bypass        │

# Na:
│ - SECURITY DEFINER  │
```

2. **Line 128** - Zmienić:
```markdown
# Zamiast:
- `PrismaService.withoutRls()` - bypass RLS dla validated tokens

# Na:
- SQL SECURITY DEFINER function `lookup_public_link_by_token()` - secure token lookup
- `PrismaService.forWorkspace()` - RLS-protected queries after validation
```

3. **Lines 236-256** - Nowy diagram:
```markdown
## Public API Flow (Token-based Access)

┌────────────────────┐
│ Public API Request │
│ with token         │
└────────┬───────────┘
         │ validate token
         v
┌─────────────────────────────┐
│ lookup_public_link_by_token │
│ (SECURITY DEFINER function) │
│ - Bypasses RLS safely       │
│ - Only for token lookup     │
│ - Validates isActive        │
│ - Validates expiresAt       │
└────────┬────────────────────┘
         │ returns: workspaceId, link metadata
         v
┌─────────────────────────────┐
│ forWorkspace(workspaceId)   │
│ - RLS ENABLED               │
│ - Queries documents         │
└────────┬────────────────────┘
         │ filtered by workspace
         v
┌─────────────────────────────┐
│ PostgreSQL RLS policies     │
│ - workspace_id comparison   │
└─────────────────────────────┘
```

**Weryfikacja:**
- [ ] ecosystem.md zaktualizowane
- [ ] Wszystkie wzmianki o `withoutRls()` zastąpione SECURITY DEFINER
- [ ] Diagramy są aktualne

**Estimated:** 30 min

---

#### 6. ✅ DONE - Dodać tabelę zmian do SPEC-001

**Priorytet:** MEDIUM
**Lokalizacja:** `community/docs/specifications/SPEC-001-row-level-security.md` after line 9
**Raport:** Documentation Review - HIGH

**Rozwiązanie (2025-12-29):**
Dodano sekcję "Refactorization Changes (2025-12-28 + 2025-12-29)" do SPEC-001 z:
- Tabelą porównawczą user-based vs workspace-based
- Listą non-breaking changes
- Listą security improvements
- Linkami do powiązanych specyfikacji

**Akcja:**
Dodać sekcję po line 9:

```markdown
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
```

**Weryfikacja:**
- [ ] SPEC-001 zaktualizowane
- [ ] Tabela zmian kompletna
- [ ] Linki do powiązanych specyfikacji

**Estimated:** 20 min

---

#### 7. Dodać dedicated mapper function w repository

**Priorytet:** MEDIUM
**Lokalizacja:** `community/apps/api/src/infrastructure/persistence/repositories/public-link.repository.impl.ts`
**Raport:** Code Quality Review - MEDIUM #1

**Problem:**
`findByTokenWithWorkspace()` ręcznie mapuje SQL results do domain types. To code smell - manual field mapping, type assertion `as PublicLinkWithWorkspace`, brak compile-time verification.

**Akcja:**
Utworzyć dedykowaną funkcję mapper:

```typescript
// Option 1: Private method
private mapSqlToPublicLinkWithWorkspace(row: {
  id: string;
  workspace_id: string;
  token: string;
  // ... all SQL fields (snake_case)
}): PublicLinkWithWorkspace {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    token: row.token,
    // ... centralized mapping logic
  };
}

// Usage:
const row = results[0];
return this.mapSqlToPublicLinkWithWorkspace(row);

// Option 2: Static mapper class (if reused in multiple repos)
class PublicLinkSqlMapper {
  static fromSql(row: SqlPublicLinkRow): PublicLinkWithWorkspace {
    // Validates all required fields
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      // ...
    };
  }
}
```

**Korzyści:**
- Centralizacja mapping logic (DRY)
- Łatwiejsza ewolucja schema (one place to update)
- Compile-time verification (TypeScript checks field mapping)
- Testowalna funkcja (unit test dla mappera)

**Weryfikacja:**
- [ ] Mapper function utworzona
- [ ] `findByTokenWithWorkspace()` używa mappera
- [ ] Type assertion usunięty
- [ ] Unit test dla mappera (optional)

**Estimated:** 30 min

---

#### 8. Dodać JSDoc dla security boundary method

**Priorytet:** MEDIUM
**Lokalizacja:** `community/apps/api/src/infrastructure/persistence/repositories/public-link.repository.impl.ts:106`
**Raport:** Code Quality Review - MEDIUM #2

**Problem:**
`findByTokenWithWorkspace()` ma inline comments ale nie ma JSDoc. To critical security boundary (RLS bypass via SECURITY DEFINER) - powinna mieć jasną dokumentację dla developers.

**Akcja:**
Dodać JSDoc:

```typescript
/**
 * Validates a public link token using SECURITY DEFINER function.
 *
 * SECURITY NOTE: This method bypasses RLS using a PostgreSQL SECURITY DEFINER
 * function to allow unauthenticated token lookups. The token acts as the
 * authorization mechanism.
 *
 * The function verifies:
 * - Token exists in database
 * - Link is active (isActive = true)
 * - Link has not expired (expiresAt > NOW or NULL)
 *
 * @param token - Cryptographic token (32 bytes = 64 hex chars)
 * @returns PublicLink with workspace info, or null if not found/inactive/expired
 *
 * @see migrations/20251229100000_add_public_link_token_lookup_function
 * @security Uses lookup_public_link_by_token() SQL function (SECURITY DEFINER)
 *
 * @example
 * const link = await repository.findByTokenWithWorkspace('abc123...');
 * if (!link) {
 *   throw new NotFoundException('Invalid or expired token');
 * }
 * // Use link.workspaceId for subsequent RLS-protected queries
 */
async findByTokenWithWorkspace(token: string): Promise<PublicLinkWithWorkspace | null> {
  // ...
}
```

**Weryfikacja:**
- [ ] JSDoc dodany
- [ ] IDE autocomplete pokazuje security warning
- [ ] Link do migration
- [ ] Example usage

**Estimated:** 15 min

---

#### 9. ✅ DONE - Zastąpić usunięty audit log

**Priorytet:** MEDIUM
**Lokalizacja:** `community/apps/api/src/infrastructure/persistence/repositories/public-link.repository.impl.ts`
**Raport:** Architecture Review - nie wymienione, ale `withoutRls()` miało audit log

**Rozwiązanie (2025-12-29):**
Dodano audit logging do `findByTokenWithWorkspace()` w PublicLinkRepository:
- `SECURITY_DEFINER_CALL` - przed wywołaniem funkcji (z tokenPrefix)
- `SECURITY_DEFINER_RESULT` - po wywołaniu (NOT_FOUND lub FOUND z workspaceId)
- Privacy: logujemy tylko pierwsze 8 znaków tokenu

```typescript
this.logger.debug({
  event: 'SECURITY_DEFINER_CALL',
  function: 'lookup_public_link_by_token',
  tokenPrefix: token.length >= 8 ? `${token.substring(0, 8)}...` : 'invalid',
  timestamp: new Date().toISOString(),
});
```

**Weryfikacja:**
- [x] Audit log dodany
- [x] Logs zawierają timestamp, function name, partial token
- [x] Privacy zachowana (nie logujemy pełnego tokenu)

**Completed:** 2025-12-29

---

### 🟢 LOW (backlog)

#### 10. Per-token rate limiting

**Priorytet:** LOW
**Lokalizacja:** NestJS middleware or nginx config
**Raport:** Migration Review - Long-term recommendations #1

**Problem:**
Public API nie ma rate limiting per token. Możliwy abuse (token leakage → unlimited requests).

**Akcja:**
Zaimplementować rate limiting:

```typescript
// NestJS middleware (simpler)
@Injectable()
export class PublicApiRateLimitMiddleware implements NestMiddleware {
  private tokenRequests = new Map<string, { count: number; resetAt: Date }>();

  use(req: Request, res: Response, next: NextFunction) {
    const token = req.params.token;
    const now = new Date();

    const limit = this.tokenRequests.get(token);

    if (limit && limit.resetAt > now) {
      if (limit.count >= 100) { // 100 req/min
        throw new TooManyRequestsException('Rate limit exceeded');
      }
      limit.count++;
    } else {
      this.tokenRequests.set(token, {
        count: 1,
        resetAt: new Date(now.getTime() + 60000), // 1 min
      });
    }

    next();
  }
}

// Lub nginx config (better for production)
# nginx.conf
limit_req_zone $arg_token zone=public_api:10m rate=100r/m;

location /api/v1/public {
  limit_req zone=public_api burst=10;
}
```

**Weryfikacja:**
- [ ] Rate limiting zaimplementowany
- [ ] Test: 101 requests w ciągu 1 min → 429 Too Many Requests
- [ ] Monitoring rate limit hits

**Estimated:** 1h (backlog)

---

#### 11. Query timeout configuration dla SECURITY DEFINER

**Priorytet:** LOW
**Lokalizacja:** PostgreSQL config or function definition
**Raport:** Architecture Review - nie wymienione, ale good practice

**Problem:**
SECURITY DEFINER function może być wolna dla dużych tabel (unlikely ale możliwe). Brak timeout może zablokować connection pool.

**Akcja:**
Dodać timeout do funkcji:

```sql
-- W migration.sql
CREATE FUNCTION lookup_public_link_by_token(p_token TEXT)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET statement_timeout = '5s' -- Timeout after 5 seconds
AS $$
BEGIN
  -- ...
END;
$$;
```

**Weryfikacja:**
- [ ] Timeout dodany
- [ ] Test: Query powyżej 5s → timeout exception
- [ ] Monitoring slow queries

**Estimated:** 15 min (backlog)

---

#### 12. Token format validation w SQL function

**Priorytet:** LOW
**Lokalizacja:** `community/apps/api/prisma/migrations/20251229100000_add_public_link_token_lookup_function/migration.sql`
**Raport:** Migration Review - MEDIUM #2 (opcjonalne)

**Problem:**
Funkcja przyjmuje `p_token TEXT` bez walidacji formatu. Token powinien być 64-char hex string.

**Akcja:**
Dodać walidację w funkcji:

```sql
CREATE FUNCTION lookup_public_link_by_token(p_token TEXT)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Validate token format (64 hex chars)
  IF LENGTH(p_token) != 64 OR p_token !~ '^[a-f0-9]{64}$' THEN
    RETURN; -- Return empty, not exception (public API)
  END IF;

  RETURN QUERY
  SELECT ...
  WHERE pl.token = p_token
    AND pl."isActive" = true
    AND (pl."expiresAt" IS NULL OR pl."expiresAt" > NOW());
END;
$$;
```

**Korzyści:**
- Defense in depth (application layer też powinno walidować)
- Early return dla invalid tokens (nie query database)
- Clear contract (token MUST be 64 hex chars)

**Weryfikacja:**
- [ ] Walidacja dodana
- [ ] Test: Short token → empty result
- [ ] Test: Non-hex token → empty result
- [ ] Test: Valid token → result

**Estimated:** 15 min (backlog)

---

#### 13. Rollback script dla migration

**Priorytet:** LOW
**Lokalizacja:** `community/apps/api/prisma/migrations/20251229100000_add_public_link_token_lookup_function/down.sql`
**Raport:** Architecture Review - LOW #1

**Problem:**
Brak explicit rollback script dla SECURITY DEFINER function.

**Akcja:**
Utworzyć rollback script:

```sql
-- File: apps/api/prisma/migrations/20251229100000_add_public_link_token_lookup_function/down.sql
DROP FUNCTION IF EXISTS lookup_public_link_by_token(TEXT);
REVOKE EXECUTE ON FUNCTION lookup_public_link_by_token(TEXT) FROM PUBLIC;
```

**Weryfikacja:**
- [ ] Rollback script utworzony
- [ ] Test rollback na staging
- [ ] Funkcja usunięta po rollback

**Estimated:** 10 min (backlog)

---

## Akceptacja

Specyfikacja jest zrealizowana gdy:

- [ ] **Wszystkie CRITICAL rozwiązane** (przed deploy)
  - [ ] SQL function waliduje isActive/expiresAt
  - [ ] Pole updated_at usunięte lub poprawione
  - [ ] Vulnerable dependencies zaktualizowane

- [ ] **Wszystkie HIGH rozwiązane** (przed merge)
  - [ ] Integration test dla SECURITY DEFINER function

- [ ] **Build przechodzi**
  - [ ] `pnpm build` - success
  - [ ] `pnpm lint` - 0 errors

- [ ] **Testy przechodzą**
  - [ ] Unit tests: 100%
  - [ ] Integration tests: Public link SECURITY DEFINER scenarios
  - [ ] RLS isolation tests: PASS

- [ ] **Dokumentacja zaktualizowana**
  - [ ] ecosystem.md - Public API flow
  - [ ] SPEC-001 - tabela zmian
  - [ ] JSDoc - security boundary method

---

## Architecture References

- [Ecosystem - Public API Context](../../docs/ecosystem.md#public-api-context)
- [SPEC-001: Row Level Security](./SPEC-001-row-level-security.md)
- [SPEC: RLS Per-Workspace Refactor](./2025-12-28-rls-per-workspace-refactor.md)
- [ADR-2025-12-28: RLS Workspace Context Refactor](../adr/ADR-2025-12-28-rls-workspace-context-refactor.md)

---

## Estimacja

| Priorytet | Zadania | Czas szacowany |
|-----------|---------|----------------|
| CRITICAL  | 3 zadania | 55 min |
| HIGH      | 1 zadanie | 1h |
| MEDIUM    | 5 zadań | 2h 35 min |
| LOW       | 4 zadania | 2h 40 min (backlog) |
| **TOTAL (before merge)** | **CRITICAL + HIGH** | **~2h** |
| **TOTAL (all)** | **13 zadań** | **~7h** |

---

## Review History

### 2025-12-29 - Initial Specification

Created from code review reports:
- Architecture Review: ✅ APPROVED (z sugestiami MEDIUM/LOW)
- Security Review: (brak raportu z dzisiaj)
- Test Review: ⚠️ Requires integration tests before merge (HIGH)
- Code Quality Review: ✅ APPROVED FOR MERGE (score 8.5/10)
- Documentation Review: ⚠️ APPROVE z minor fixes (HIGH)
- Migration Review: ⚠️ Requires fixes before deploy (MUST items)

**Key findings:**
- SECURITY DEFINER approach is BETTER than `withoutRls()` (limited scope, auditable)
- Migration missing critical validation (isActive/expiresAt)
- Missing integration tests for security-critical function
- Documentation needs updates (ecosystem.md, SPEC-001)

**Status:** Ready for implementation (po naprawieniu CRITICAL items)
