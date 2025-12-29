# Security Review Report - 2025-12-29

## Kontekst

### Przeanalizowane moduły
- Infrastructure / Persistence / PrismaService (RLS bypass removal)
- Infrastructure / Repositories / PublicLinkRepository
- Database / Migrations (SECURITY DEFINER function)
- Application / PublicLinkService
- Interface / HTTP / PublicController

### Powiązane dokumenty
- `/community/docs/ecosystem.md` - Multi-tenancy architecture with RLS
- `/community/apps/api/src/infrastructure/persistence/rls/README.md` - RLS implementation details
- `/CLAUDE.md` - Project engineering principles
- Migration: `20251229100000_add_public_link_token_lookup_function/migration.sql`

### Natura zmian
Zamiana application-level RLS bypass (`withoutRls()`) na database-level SECURITY DEFINER function dla public token lookup. Jest to **security hardening** - przejście z elastycznego, ale potencjalnie niebezpiecznego mechanizmu na ściśle kontrolowany, audytowalny punkt dostępu.

---

## Security Review Results

### 1. OWASP Top 10 Analysis

#### A01:2021 - Broken Access Control

**OCENA: PASS (Improved)**

Przed zmianą:
- `withoutRls()` był ogólnym mechanizmem bypass'u RLS - mógł być użyty w dowolnym miejscu aplikacji
- Brak granularnej kontroli - jeśli wywołano `withoutRls()`, miało się dostęp do WSZYSTKICH workspace'ów

Po zmianie:
- SECURITY DEFINER function `lookup_public_link_by_token()` jest dedicated do jednego use case
- Function wykonuje TYLKO lookup po tokenie - nie pozwala na arbitrary queries
- Token musi być znany (cryptographically secure 64-char hex = 32 bytes entropy)
- Po lookup'ie, dalsze queries używają `forUser(ownerId)` co przywraca RLS context

**Pozytywne aspekty:**
```typescript
// public-link.service.ts line 195
return this.prisma.forUser(ownerId, async (tx) => {
  const [documents, totalCount] = await Promise.all([
    tx.document.findMany({ where, ... }),
    tx.document.count({ where }),
  ]);
```
Po walidacji tokena, service używa workspace owner jako RLS context - nie bypass, ale kontrolowany dostęp.

**Rekomendacja:** Dodaj audit logging dla wywołań `lookup_public_link_by_token()` na poziomie database (PostgreSQL log_statement).

---

#### A02:2021 - Cryptographic Failures

**OCENA: PASS**

Token generation (public-link.service.ts:90):
```typescript
const token = randomBytes(32).toString('hex');
```

- Używa `crypto.randomBytes` - cryptographically secure PRNG (nie Math.random())
- 32 bytes = 256 bits entropy
- Encoding hex = 64 characters
- Przestrzeń tokenów: 16^64 = 2^256 (praktycznie niemożliwe do brute-force)

**Threat model:**
- Token leakage - jeśli token wycieknie (logs, analytics), atakujący może uzyskać dostęp do public workspace
- **Mitigacja obecna:** Token tylko w URL params, nie w headers (brak CORS pre-flight leakage), rate limiting 30 req/min
- **Brakująca mitigacja:** Brak token rotation mechanism (expired token pozostaje w bazie)

**Rekomendacja MEDIUM:** Rozważ dodanie automatycznego usuwania/deaktywacji expired tokens (soft delete is present - `isActive` flag).

---

#### A03:2021 - Injection (SQL Injection)

**OCENA: CRITICAL REVIEW REQUIRED**

Migration SQL (lines 13-48):
```sql
CREATE OR REPLACE FUNCTION lookup_public_link_by_token(p_token TEXT)
...
WHERE pl.token = p_token;
```

**Parametryzacja:**
- Function przyjmuje `p_token TEXT` jako parametr
- WHERE clause używa `pl.token = p_token` - parametryzowane porównanie
- PostgreSQL function parameters są inherently safe od SQL injection (plpgsql sanityzuje)

**Repository usage (public-link.repository.impl.ts:122):**
```typescript
const results = await this.prisma.$queryRaw<...>`
  SELECT * FROM lookup_public_link_by_token(${token})
`;
```

**CRITICAL ANALYSIS:**
- Prisma `$queryRaw` with tagged template literals automatycznie parametryzuje
- Token jest passed jako parameter do function, nie interpolowany do SQL string
- PostgreSQL PREPARE/EXECUTE mechanism zapewnia defense against injection

**Test:**
```typescript
// Hypothetical attack
const maliciousToken = "'; DROP TABLE PublicLink; --";
// Result:
// SELECT * FROM lookup_public_link_by_token($1)
// $1 = "'; DROP TABLE PublicLink; --"
// Function searches for EXACT match - no injection possible
```

**PASS** - Parametryzacja jest prawidłowa.

**Dodatkowa ochrona:**
- Token validation format (public-link.service.ts:131-145) sprawdza `isActive`, `expiresAt` AFTER lookup
- Nawet jeśli hypothetical injection byłby możliwy, dalsze checks blokowałyby dostęp

---

#### A04:2021 - Insecure Design

**OCENA: PASS (Architectural Excellence)**

Design decision: PostgreSQL SECURITY DEFINER zamiast application-level bypass.

**Zalety:**
1. **Defense in depth** - security na poziomie database, nie tylko aplikacji
2. **Audytowalne** - wszystkie wywołania function są logowane przez PostgreSQL (jeśli włączone)
3. **Single Responsibility** - function robi TYLKO token lookup, nie arbitrary queries
4. **Least Privilege** - function działa z elevated privileges, ale TYLKO dla specific operation

**Poprzednie rozwiązanie (withoutRls):**
```typescript
async withoutRls<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return this.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', 'SYSTEM', true)`;
    return callback(tx); // ❌ Callback może wykonać DOWOLNE queries!
  });
}
```

**Nowe rozwiązanie:**
```sql
-- ✅ Function może TYLKO lookup token, nic więcej
SELECT * FROM "PublicLink" pl
JOIN "Workspace" w ON w.id = pl."workspaceId"
WHERE pl.token = p_token;
```

**PASS** - Design pattern jest zgodny z security best practices.

---

#### A05:2021 - Security Misconfiguration

**OCENA: MEDIUM - Wymaga monitoringu**

Migration line 52:
```sql
GRANT EXECUTE ON FUNCTION lookup_public_link_by_token(TEXT) TO PUBLIC;
```

**Analysis:**
- `TO PUBLIC` oznacza, że KAŻDY user (nawet unauthenticated) może wywołać function
- Jest to **intentional** - public API wymaga unauthenticated access
- Function jest SECURITY DEFINER - runs with elevated privileges

**Risk:**
- Jeśli function ma bug (np. information disclosure), atakujący może go exploit bez autentykacji
- Function może być target DoS attacks (wywołać miliony razy)

**Mitigacje obecne:**
1. Rate limiting na controller level (30 req/min)
2. Token entropy (2^256) - brute force impossible
3. Function jest read-only (SELECT only, no INSERT/UPDATE/DELETE)
4. Explicit column selection (no `SELECT *` returned to application - mapped explicitly)

**Brakujące mitigacje:**
1. Brak database-level rate limiting (PostgreSQL connection pooling może być overflow)
2. Brak alerting na abnormal usage patterns

**Rekomendacja MEDIUM:** Dodaj monitoring dla wywołań function (PostgreSQL log_statement lub pg_stat_statements).

---

#### A06:2021 - Vulnerable and Outdated Components

**OCENA: HIGH - Wymaga naprawy**

pnpm audit wyniki (22 vulnerabilities):

1. **HIGH:** html-minifier REDoS (GHSA-pfq8-rq6v-vf5m)
   - Vulnerable: <=4.0.0
   - Path: @nestjs-modules/mailer > mjml > html-minifier
   - Impact: Regex DoS - atakujący może spowodować CPU spike przez crafted HTML
   - **Exposure:** Server-side email rendering (MailerModule)
   - **Threat:** Jeśli user może kontrolować email templates → DoS

2. **HIGH:** glob CLI command injection (GHSA-5j98-mcp5-4vw2)
   - Vulnerable: 10.2.0 - 10.4.5
   - Path: mjml-cli > glob
   - Impact: Shell command injection via -c/--cmd flag
   - **Exposure:** Build-time only (mjml dev dependency)
   - **Threat:** LOW (nie używane w runtime)

3. **MODERATE:** esbuild CORS/SSRF (GHSA-67mh-4wv8-2f99)
   - Vulnerable: <=0.24.2
   - Path: apps/web > vitest > vite > esbuild
   - Impact: Development server CORS bypass
   - **Exposure:** Development only
   - **Threat:** LOW (nie w production)

4. **MODERATE:** nodemailer domain confusion (CVE-2024-XXXXX)
   - Vulnerable: <7.0.7
   - Path: @nestjs-modules/mailer > nodemailer
   - Impact: Email może być wysłany do unintended domain
   - **Exposure:** Email sending (password reset, invitations)
   - **Threat:** MEDIUM (możliwe phishing via confused deputy)

**Rekomendacje:**
- **IMMEDIATE:** Upgrade nodemailer do >=7.0.7
- **HIGH:** Upgrade mjml lub wyłącz html-minifier w produkcji
- **MEDIUM:** Upgrade esbuild (dev dependency)
- **LOW:** Upgrade glob (już 10.4.5, wymaga 10.5.0)

---

#### A07:2021 - Identification and Authentication Failures

**OCENA: PASS**

Public API nie wymaga autentykacji - jest to **by design** (public links).

Token validation (public-link.service.ts:130-146):
```typescript
async validateToken(token: string): Promise<PublicLinkWithWorkspace> {
  const result = await this.publicLinkRepository.findByTokenWithWorkspace(token);

  if (!result) {
    throw new NotFoundException('Invalid token');
  }

  if (!result.isActive) {
    throw new ForbiddenException('Link is inactive');
  }

  if (result.expiresAt && result.expiresAt < new Date()) {
    throw new ForbiddenException('Link has expired');
  }

  return result;
}
```

**Sprawdzone:**
- Token existence
- isActive flag (soft delete)
- Expiration date (time-based access control)

**Brakujące sprawdzenia:**
- IP whitelisting (optional feature)
- Usage quotas (rate limiting jest na controller, ale nie per-token)

**Rekomendacja LOW:** Rozważ per-token rate limiting (stored w Redis).

---

#### A08:2021 - Software and Data Integrity Failures

**OCENA: PASS**

Migration file integrity:
- Migration jest versioned (20251229100000_*)
- Prisma schema + SQL migrations są w VCS
- Migration nie modyfikuje danych, tylko DDL (function creation)

**Verification block:**
```sql
DO $$
BEGIN
  RAISE NOTICE 'Public link token lookup function created successfully';
END $$;
```

**Brak checksums/signatures** - standardowe dla Prisma migrations.

---

#### A09:2021 - Security Logging and Monitoring Failures

**OCENA: MEDIUM - Wymaga poprawy**

**Obecne logging:**

1. **USUNIĘTY** logging z withoutRls:
```typescript
// BYŁO (usunięte):
this.logger.warn({
  event: 'RLS_BYPASS',
  message: 'withoutRls() called - bypassing Row Level Security',
  timestamp: new Date().toISOString(),
  stackTrace,
});
```

2. **Brak** logging dla SECURITY DEFINER function calls (PostgreSQL domyślnie nie loguje)

3. **Partial** logging w PublicLinkService:
```typescript
// line 70
this.logger.error(`Failed to generate signed URL for key: ${key}`, error);
```

**Brakujące:**
- Audit log dla validateToken() calls (kto, kiedy, jaki token)
- Database-level logging dla lookup_public_link_by_token()
- Metrics dla public API usage (ile queries per token)
- Alerting na suspicious patterns (100s of failed token validations)

**Rekomendacje HIGH:**
```typescript
// public-link.service.ts - dodaj w validateToken():
this.logger.log({
  event: 'PUBLIC_TOKEN_VALIDATION',
  token: token.substring(0, 8) + '...', // Partial token (first 8 chars)
  workspaceId: result.workspaceId,
  isActive: result.isActive,
  expiresAt: result.expiresAt,
  timestamp: new Date().toISOString(),
});
```

PostgreSQL config (postgresql.conf):
```
log_statement = 'mod'  # Log all DDL/DML
log_min_duration_statement = 1000  # Log slow queries
```

---

#### A10:2021 - Server-Side Request Forgery (SSRF)

**OCENA: PASS**

Public API nie wykonuje outbound requests oparte na user input.

Jedyny external call: `storageService.getSignedUrl(key)` (line 68)

**Key validation (line 62-64):**
```typescript
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
if (!uuidRegex.test(key)) {
  return null;
}
```

File keys muszą mieć UUID prefix - brak możliwości path traversal lub arbitrary URL.

---

### 2. Specific Security Checks

#### Multi-tenancy Isolation

**OCENA: PASS**

Workflow:
1. Token lookup via SECURITY DEFINER → zwraca `workspaceId`
2. Dalsze queries używają `forUser(ownerId)` z tym workspaceId
3. RLS policies enforce workspace isolation

Test case simulation:
```typescript
// User A creates public link for Workspace A
const linkA = await createPublicLink(workspaceA.id, userA.id);

// Attacker tries to use linkA token to access Workspace B documents
// public-link.service.ts line 314:
WHERE d."workspaceId" = ${link.workspaceId}  // ✅ Locked to Workspace A
```

**Brak cross-tenant leakage.**

---

#### Request Context & Permissions

**OCENA: PASS**

Public endpoints nie wymagają authenticated user context - używają workspace owner:

```typescript
// public-link.service.ts line 162
const ownerId = link.workspace.createdById;

// line 195
return this.prisma.forUser(ownerId, async (tx) => {
```

Owner ma zawsze dostęp do swojego workspace → RLS pass.

---

#### Event Bus (Commands)

**OCENA: N/A**

Public API nie emituje events - tylko read operations.

---

#### ACL (Anti-Corruption Layer)

**OCENA: PASS**

Public API zwraca własne DTOs, nie raw Prisma models:

```typescript
// public-link.service.ts line 210-218
const documentsWithSignedUrls = await Promise.all(
  documents.map(async (doc) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    tags: doc.tags.map((t) => t.tag.name),
    verificationStatus: doc.verificationStatus,
    fileUrl: await this.getSignedFileUrl(doc.fileUrl),
    createdAt: doc.createdAt,
  })),
);
```

Brak leakage internal fields (workspaceId, userId, etc.).

---

#### Secrets & Credentials

**OCENA: PASS**

Grep results pokazują:
- `JWT_SECRET` - loaded via ConfigService (line: auth.module.ts:29)
- `OPENAI_API_KEY` - loaded via ConfigService
- Brak hardcoded secrets w kodzie

**Migration file:** Brak credentials w SQL.

Token generation używa `randomBytes(32)` - cryptographically secure.

---

### 3. SECURITY DEFINER Specific Risks

#### Privilege Escalation

**Risk:** SECURITY DEFINER function działa z prawami function owner (zwykle superuser).

**Mitigacje:**
1. Function jest read-only (tylko SELECT)
2. Explicit column selection (no wildcards in return)
3. Single responsibility (TYLKO token lookup)
4. STABLE marker - function nie modyfikuje database

**Verification:**
```sql
-- migration.sql line 29
STABLE  -- ✅ Promise to PostgreSQL: no side effects
```

**PASS** - Brak możliwości escalation.

---

#### Information Disclosure

**Risk:** Function może zwrócić więcej danych niż intended.

**Analysis:**
```sql
-- Lines 33-44: Explicit column selection
SELECT
  pl.id::TEXT,
  pl."workspaceId"::TEXT as workspace_id,
  pl.token,
  pl.name,
  pl."allowedTags" as allowed_tags,
  pl."expiresAt" as expires_at,
  pl."isActive" as is_active,
  pl."createdAt" as created_at,
  pl."updatedAt" as updated_at,
  w.name as workspace_name,
  w."createdById"::TEXT as workspace_created_by_id
FROM "PublicLink" pl
JOIN "Workspace" w ON w.id = pl."workspaceId"
WHERE pl.token = p_token;
```

**Zwracane dane:**
- PublicLink metadata (OK - public link is public by design)
- Workspace name (OK - displayed to end users)
- Workspace createdById (OK - używane jako RLS context, nie exposed na API)

**Repository mapping (lines 131-146):**
```typescript
return {
  id: row.id,
  workspaceId: row.workspace_id,
  token: row.token,  // ⚠️ Token jest zwracany
  name: row.name,
  allowedTags: row.allowed_tags,
  expiresAt: row.expires_at,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  workspace: {
    id: row.workspace_id,
    name: row.workspace_name,
    createdById: row.workspace_created_by_id,  // ⚠️ Owner ID exposed
  },
} as PublicLinkWithWorkspace;
```

**POTENTIAL ISSUE MEDIUM:**
- `token` jest zwracany w response (chociaż jest to token który użytkownik już zna)
- `createdById` jest exposed (potential user enumeration)

**Rekomendacja:**
Sprawdź czy `createdById` jest używane tylko internally. Jeśli jest exposed na API - rozważ usunięcie z public responses.

---

#### Denial of Service

**Risk:** Unauthenticated users mogą spam'ować function.

**Mitigacje:**
1. Rate limiting (30 req/min) - controller level
2. Database connection pooling (Prisma default)
3. Function jest STABLE + indexed query (fast)

**Brakujące:**
- PostgreSQL connection limits per IP (wymaga pg_bouncer lub similar)
- Query timeout (Prisma default: 10s)

**Rekomendacja LOW:** Dodaj explicit query timeout w Prisma config.

---

## Summary

### Critical Issues (wymaga natychmiastowej naprawy)

**Brak.**

---

### High Issues (naprawić przed merge)

**1. Vulnerable Dependencies**

**Kategoria:** A06 - Vulnerable Components

**Opis:**
- nodemailer <7.0.7 - email domain confusion vulnerability
- html-minifier <=4.0.0 - ReDoS vulnerability

**Naprawa:**
```bash
# Package.json updates
pnpm update nodemailer@latest
pnpm update @nestjs-modules/mailer@latest  # May require breaking changes check
```

**Weryfikacja:**
```bash
pnpm audit | grep -E "high|critical"
```

---

### Medium Issues (naprawić w kolejnej iteracji)

**1. Brak Security Logging dla Public Token Usage**

**Kategoria:** A09 - Security Logging Failures

**Opis:**
Usunięcie `withoutRls()` usunęło również audit logging dla RLS bypass. SECURITY DEFINER function nie ma zastępczego loggingu.

**Naprawa:**
```typescript
// public-link.service.ts - validateToken() method
async validateToken(token: string): Promise<PublicLinkWithWorkspace> {
  const result = await this.publicLinkRepository.findByTokenWithWorkspace(token);

  if (!result) {
    this.logger.warn({
      event: 'PUBLIC_TOKEN_INVALID',
      token: token.substring(0, 8),
      timestamp: new Date().toISOString(),
    });
    throw new NotFoundException('Invalid token');
  }

  // Log successful validation
  this.logger.log({
    event: 'PUBLIC_TOKEN_VALIDATED',
    workspaceId: result.workspaceId,
    tokenId: result.id,
    expiresAt: result.expiresAt,
    timestamp: new Date().toISOString(),
  });

  // ... rest of validation
}
```

PostgreSQL logging (postgresql.conf):
```
log_statement = 'mod'
shared_preload_libraries = 'pg_stat_statements'
```

---

**2. Expired Token Cleanup**

**Kategoria:** A02 - Cryptographic Failures (Data Hygiene)

**Opis:**
Expired tokens pozostają w bazie z `isActive: true` - teoretycznie mogą być reaktywowane przez bug lub admin mistake.

**Naprawa:**
Scheduled job (cron):
```typescript
@Cron('0 0 * * *')  // Daily at midnight
async cleanupExpiredTokens() {
  const count = await this.prisma.publicLink.updateMany({
    where: {
      expiresAt: { lt: new Date() },
      isActive: true,
    },
    data: { isActive: false },
  });
  this.logger.log(`Deactivated ${count.count} expired public links`);
}
```

---

**3. Monitoring dla SECURITY DEFINER Usage**

**Kategoria:** A05 - Security Misconfiguration

**Opis:**
Brak visibility ile razy function jest wywoływana, z jakich IP, success/failure rate.

**Naprawa:**
1. Enable `pg_stat_statements`:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Query usage
SELECT
  calls,
  total_exec_time,
  mean_exec_time,
  query
FROM pg_stat_statements
WHERE query LIKE '%lookup_public_link_by_token%';
```

2. Application metrics (Prometheus/Grafana):
```typescript
// Add counter in service
@Counter('public_token_validations_total')
private tokenValidationCounter;

@Counter('public_token_validation_failures_total')
private tokenValidationFailureCounter;

async validateToken(token: string) {
  this.tokenValidationCounter.inc();
  try {
    // ... validation
  } catch (error) {
    this.tokenValidationFailureCounter.inc();
    throw error;
  }
}
```

---

### Low Issues (rekomendacja)

**1. Per-Token Rate Limiting**

**Kategoria:** A07 - Authentication Failures (Rate Limiting)

**Opis:**
Obecny rate limit (30 req/min) jest global. Atakujący może spam'ować JEDEN token i nie wpłynie to na inne tokeny.

**Naprawa:**
```typescript
// Use Redis-based rate limiting per token
@Throttle({ default: { limit: 30, ttl: 60000 } })
@UseGuards(TokenThrottlerGuard)  // Custom guard
async searchGet(@Param('token') token: string, ...) {
```

Custom guard:
```typescript
@Injectable()
export class TokenThrottlerGuard implements CanActivate {
  constructor(private redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.params.token;
    const key = `rate_limit:token:${token}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 60);  // 60 seconds TTL
    }

    if (count > 10) {  // 10 requests per minute per token
      throw new ThrottlerException('Too many requests for this token');
    }

    return true;
  }
}
```

---

**2. Query Timeout Configuration**

**Kategoria:** A05 - Security Misconfiguration

**Opis:**
Brak explicit timeout dla database queries - może być target slow query DoS.

**Naprawa:**
```typescript
// prisma.service.ts
constructor() {
  super({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Add query timeout
    __internal: {
      engine: {
        queryEngineOptions: {
          queryTimeout: 5000,  // 5 seconds
        },
      },
    },
  });
}
```

---

**3. Information Disclosure - createdById**

**Kategoria:** A04 - Insecure Design (Information Leakage)

**Opis:**
Repository zwraca `workspace.createdById` - potencjalne user enumeration jeśli exposed na API.

**Weryfikacja:**
Sprawdź czy `createdById` jest used tylko internally (dla RLS context) czy również returned do client.

**Naprawa (jeśli exposed):**
```typescript
// public-link.repository.impl.ts - nie zwracaj createdById w public type
// Tylko w internal type dla RLS context
type PublicLinkWithWorkspaceInternal = PublicLinkWithWorkspace & {
  _rlsContext: { ownerId: string };
};

// Mapping - rozdziel internal od public
const internal: PublicLinkWithWorkspaceInternal = {
  ...publicFields,
  _rlsContext: { ownerId: row.workspace_created_by_id },
};
```

---

## Positive Aspects

**Co jest dobrze zrobione pod kątem security:**

1. **Architectural Security Enhancement**
   - Przejście z application-level bypass na database-level SECURITY DEFINER to textbook security hardening
   - Single Responsibility Principle - function robi TYLKO token lookup
   - Least Privilege - elevated privileges tylko dla specific operation

2. **Cryptographically Secure Token Generation**
   - `randomBytes(32)` - proper CSPRNG
   - 256-bit entropy - praktycznie impossible to brute force
   - Consistent z innymi tokenami w systemie (verification tokens, invitation tokens)

3. **Defense in Depth**
   - Token validation na application level (isActive, expiresAt)
   - RLS enforcement na database level (workspace isolation)
   - Rate limiting na HTTP level (throttling)

4. **SQL Injection Prevention**
   - Parametryzowane queries via Prisma tagged templates
   - PostgreSQL function parameters (plpgsql sanityzuje)
   - Brak string concatenation w SQL

5. **Clear Separation of Concerns**
   - Repository layer - database access
   - Service layer - business logic (token validation)
   - Controller layer - HTTP handling + rate limiting
   - Clean Architecture principles przestrzegane

6. **Comprehensive Testing Updates**
   - Tests zaktualizowane do nowego API (z `withoutRls` na `$queryRaw`)
   - Integration tests weryfikują RLS enforcement

7. **Documentation Updates**
   - README.md zaktualizowany z nowym flow
   - Migration ma clear security comments
   - Removal of withoutRls jest explicit (not silent)

---

## Recommended Actions

### Immediate (przed deploy do production)

1. Upgrade vulnerable dependencies (nodemailer, html-minifier)
2. Dodaj security logging w `validateToken()`
3. Enable PostgreSQL query logging (`log_statement = 'mod'`)

### Short-term (w ciągu tygodnia)

1. Implement expired token cleanup job
2. Add monitoring dla `lookup_public_link_by_token()` usage
3. Verify że `createdById` nie jest exposed w public API responses

### Long-term (next sprint)

1. Per-token rate limiting (Redis-based)
2. Query timeout configuration
3. Alerting na suspicious patterns (failed validations spike)
4. Consider token rotation mechanism dla active public links

---

## Conclusion

**Overall Security Rating: GOOD with MEDIUM improvements needed**

Zmiana z `withoutRls()` na SECURITY DEFINER function jest **pozytywna z security perspective**. Rozwiązanie:

- Ogranicza surface area dla RLS bypass
- Jest bardziej audytowalne
- Stosuje database-level security controls
- Nie wprowadza nowych critical vulnerabilities

**Główne areas for improvement:**
- Logging & monitoring (usunięty audit log wymaga zastąpienia)
- Vulnerable dependencies (niezwiązane z tym PR, ale requires action)
- Data hygiene (expired tokens cleanup)

**Brak critical security issues** - zmiany mogą być merge'owane po naprawieniu HIGH issues (dependencies).

---

**Report generated:** 2025-12-29 00:23 UTC
**Reviewed by:** Claude Code Security Agent
**Scope:** RLS bypass removal + SECURITY DEFINER function implementation
**Status:** APPROVED with recommended improvements
