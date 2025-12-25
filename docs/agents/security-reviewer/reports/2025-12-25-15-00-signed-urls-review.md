# Security Review Report - 2025-12-25

**Reviewer:** Security Review Agent
**Date:** 2025-12-25 15:00
**Scope:** Signed URLs Implementation for Public File Access
**Commit:** cf8155f - "fix: enforce RLS context in document and public-link services"
**Status:** Security Review Complete

---

## Kontekst

### Przeanalizowane moduły
- `apps/api/src/application/public-link/public-link.service.ts` - Added signed URL generation for public documents
- `apps/api/src/application/public-link/public-link.module.ts` - Added StorageModule import
- `apps/api/src/application/document/document.service.ts` - Existing file key extraction pattern
- `apps/api/src/infrastructure/storage/backblaze.service.ts` - S3-compatible signed URL generation
- `apps/api/src/interfaces/http/public.controller.ts` - Public API endpoints with throttling

### Powiązane dokumenty
- `docs/specifications/2025-12-24-knowledge-forge.md` - System architecture and public API spec
- `docs/specifications/SPEC-001-row-level-security.md` - RLS implementation (baseline security)
- `CLAUDE.md` - Project guidelines (Clean Architecture, DDD, Security)

### Zmiany w kodzie
1. Dodano metodę `getSignedFileUrl()` w `PublicLinkService`
2. Użyto signed URLs dla pól `fileUrl` w dokumentach zwracanych przez public API
3. Import `StorageModule` w `PublicLinkModule`
4. Backblaze S3 presigned URLs z domyślnym czasem wygaśnięcia 3600s (1h)

### Architektura
```
Public API Request
  → PublicController (with throttling: 30 req/min)
    → PublicLinkService.searchPublic() / getPublicDocuments()
      → validateToken() (checks expiry, isActive)
      → RLS context via workspace owner (forUser())
      → getSignedFileUrl() dla każdego fileUrl
        → BackblazeStorageService.getSignedUrl(key, 3600s)
          → AWS S3 getSignedUrl() presigner
```

---

## 🔴 CRITICAL (blokuje deploy)

**BRAK KRYTYCZNYCH PODATNOŚCI**

---

## 🟠 HIGH (naprawić przed merge)

### 1. [Path Traversal] Brak walidacji klucza pliku przed generowaniem signed URL

**Lokalizacja:**
- `apps/api/src/application/public-link/public-link.service.ts:47`
- `apps/api/src/application/document/document.service.ts:293`

**Problem:**
```typescript
const key = fileUrl.split('/').pop();
if (!key) return null;
return this.storageService.getSignedUrl(key);
```

Klucz pliku jest wyciągany przez `split('/').pop()` bez walidacji, co może prowadzić do:
1. **Path traversal**: Jeśli `fileUrl` zawiera `../../../etc/passwd`, `pop()` zwróci tylko `passwd`, ale brak walidacji formatu UUID może umożliwić dostęp do plików spoza bucketu.
2. **Information disclosure**: Brak weryfikacji czy plik należy do workspace dostępnego przez public link.
3. **IDOR (Insecure Direct Object Reference)**: Użytkownik może zgadywać klucze plików innych workspace'ów.

**Scenariusz ataku:**
```
1. Atakujący ma public token dla Workspace A
2. Zgaduje/enumeruje klucz pliku z Workspace B: "550e8400-e29b-41d4-a716-446655440000-secret.pdf"
3. API zwraca signed URL dla pliku z Workspace B (brak weryfikacji własności)
4. Atakujący pobiera poufny dokument
```

**Weryfikacja:**
Sprawdzam czy istnieje walidacja własności pliku przed wygenerowaniem signed URL:
```typescript
// W getPublicDocuments() i searchPublic():
// 1. validateToken() sprawdza token public link ✓
// 2. forUser(ownerId) ustawia RLS context ✓
// 3. Pobiera dokumenty z RLS filtrowanymi przez workspace ✓
// 4. Dla każdego doc.fileUrl generuje signed URL
//    → NIE MA weryfikacji czy doc.fileUrl faktycznie należy do workspace!
```

**Ryzyko:** HIGH
- **Prawdopodobieństwo:** MEDIUM (wymaga zgadnięcia/enumeracji UUID klucza)
- **Impact:** HIGH (dostęp do plików z innych workspace'ów)

**Jak naprawić:**

**Opcja 1: Waliduj format i pochodzenie klucza**
```typescript
private async getSignedFileUrl(
  fileUrl: string | null,
  workspaceId: string,
): Promise<string | null> {
  if (!fileUrl) return null;

  // 1. Extract key
  const key = fileUrl.split('/').pop();
  if (!key) return null;

  // 2. Validate UUID format (knowledge-forge uses UUID prefix)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
  if (!uuidRegex.test(key)) {
    this.logger.warn(`Invalid file key format: ${key}`);
    return null;
  }

  // 3. Verify file belongs to documents in this workspace (defense in depth)
  const fileExists = await this.prisma.forUser(
    'SYSTEM', // Use system context to check file ownership
    async (tx) => {
      const count = await tx.document.count({
        where: {
          workspaceId,
          fileUrl: { endsWith: key },
        },
      });
      return count > 0;
    },
  );

  if (!fileExists) {
    this.logger.warn(`File ${key} not found in workspace ${workspaceId}`);
    return null;
  }

  // 4. Generate signed URL (ownership verified)
  return this.storageService.getSignedUrl(key);
}

// Update call sites:
fileUrl: await this.getSignedFileUrl(doc.fileUrl, link.workspaceId),
```

**Opcja 2: Store full S3 key in database (rekomendowane)**
```typescript
// W schema.prisma:
// fileUrl zawiera pełny S3 key zamiast pełnego URL
// Wtedy backend kontroluje konstrukcję URL

private async getSignedFileUrl(s3Key: string | null): Promise<string | null> {
  if (!s3Key) return null;

  // Validate S3 key format (prevent path traversal)
  if (s3Key.includes('..') || s3Key.startsWith('/')) {
    this.logger.error(`Path traversal attempt: ${s3Key}`);
    return null;
  }

  return this.storageService.getSignedUrl(s3Key);
}
```

**Opcja 3: Nie zwracaj signed URLs w public API (najprostsza)**
```typescript
// Jeśli pliki nie muszą być dostępne publicznie:
fileUrl: null, // Zawsze zwracaj null dla public API
```

---

### 2. [Timing Attack] File enumeration przez timing różnic w odpowiedziach

**Lokalizacja:**
- `apps/api/src/application/public-link/public-link.service.ts:45-50`

**Problem:**
Gdy `fileUrl` jest null vs niepoprawny klucz, różne ścieżki kodu mogą prowadzić do różnic w czasie odpowiedzi:
```typescript
if (!fileUrl) return null;        // Fast path: ~0.1ms
const key = fileUrl.split('/').pop();
if (!key) return null;            // Fast path: ~0.5ms
return this.storageService.getSignedUrl(key);  // Slow path: ~50-200ms (AWS API call)
```

Atakujący może enumerować poprawne klucze plików przez pomiar czasu odpowiedzi.

**Scenariusz ataku:**
```
1. Atakujący wysyła 1000 requestów z różnymi UUID key
2. Większość zwraca odpowiedź w ~0.1ms (null fileUrl)
3. Niektóre zwracają odpowiedź w ~100ms (valid key, AWS call)
4. Atakujący identyfikuje poprawne klucze po czasie odpowiedzi
```

**Ryzyko:** MEDIUM-HIGH
- **Prawdopodobieństwo:** MEDIUM (wymaga automatyzacji, ale łatwe do wykonania)
- **Impact:** MEDIUM (ujawnienie istnienia plików, nie zawartości)

**Jak naprawić:**

**Opcja 1: Constant-time response**
```typescript
private async getSignedFileUrl(fileUrl: string | null): Promise<string | null> {
  // Always execute all steps to maintain constant timing
  const key = fileUrl?.split('/').pop() ?? '';
  const hasKey = key.length > 0;

  // Always call getSignedUrl (even for invalid keys) to prevent timing leak
  const signedUrl = hasKey
    ? await this.storageService.getSignedUrl(key).catch(() => null)
    : null;

  return signedUrl;
}
```

**Opcja 2: Rate limiting + response delay (już zaimplementowane częściowo)**
```typescript
// W PublicController (linia 13):
@Throttle({ default: { limit: 30, ttl: 60000 } }) // ✓ Already present

// Dodaj delay randomization:
async searchGet(...) {
  const result = await this.publicLinkService.searchPublic(token, query);

  // Add random delay (0-50ms) to mask timing differences
  await new Promise(resolve =>
    setTimeout(resolve, Math.random() * 50)
  );

  return result;
}
```

**Opcja 3: Cache signed URLs (rekomendowane)**
```typescript
// Cache signed URLs for 55 minutes (expires in 60min)
private signedUrlCache = new Map<string, { url: string; expires: number }>();

private async getSignedFileUrl(fileUrl: string | null): Promise<string | null> {
  if (!fileUrl) return null;

  // Check cache (constant time lookup)
  const cached = this.signedUrlCache.get(fileUrl);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  // Generate new signed URL
  const key = fileUrl.split('/').pop();
  if (!key) return null;

  const signedUrl = await this.storageService.getSignedUrl(key);

  // Cache for 55 minutes (expires at 60min)
  this.signedUrlCache.set(fileUrl, {
    url: signedUrl,
    expires: Date.now() + 55 * 60 * 1000,
  });

  return signedUrl;
}
```

---

### 3. [Information Disclosure] Signed URL leak przez referrer headers

**Lokalizacja:**
- `apps/api/src/infrastructure/storage/backblaze.service.ts:65-74`

**Problem:**
Signed URLs zawierają credentials w query parameters:
```
https://bucket.s3.backblaze.com/file.pdf?
  X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=ACCESS_KEY/20251225/...
  &X-Amz-Signature=...
```

Gdy użytkownik:
1. Otwiera signed URL w przeglądarce
2. Klika link do zewnętrznej strony
3. Browser wysyła `Referer: https://bucket.s3.backblaze.com/file.pdf?X-Amz-Signature=...`
4. Zewnętrzna strona otrzymuje credentials i może wykorzystać je przed wygaśnięciem

**Ryzyko:** MEDIUM
- **Prawdopodobieństwo:** LOW (wymaga user action)
- **Impact:** MEDIUM (1h ważności signed URL, read-only access)

**Jak naprawić:**

**Opcja 1: Dodaj Referrer-Policy header**
```typescript
// W main.ts (NestJS):
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
```

**Opcja 2: Proxy signed URLs przez backend**
```typescript
// Endpoint: GET /public/:token/files/:documentId
@Get(':token/files/:documentId')
async downloadFile(
  @Param('token') token: string,
  @Param('documentId') documentId: string,
  @Res() res: Response,
) {
  const link = await this.publicLinkService.validateToken(token);

  // Verify document belongs to workspace
  const document = await this.prisma.document.findFirst({
    where: { id: documentId, workspaceId: link.workspaceId },
  });

  if (!document?.fileUrl) {
    throw new NotFoundException();
  }

  // Get signed URL (internal, not exposed)
  const key = document.fileUrl.split('/').pop();
  const signedUrl = await this.storageService.getSignedUrl(key, 300); // 5min

  // Stream file through backend (signed URL nie jest ujawniony clientowi)
  const response = await fetch(signedUrl);
  const buffer = await response.arrayBuffer();

  res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${document.originalFilename}"`);
  res.send(Buffer.from(buffer));
}
```

**Opcja 3: Skróć czas wygaśnięcia (quick fix)**
```typescript
// W public-link.service.ts:
return this.storageService.getSignedUrl(key, 300); // 5 minut zamiast 1 godziny
```

---

## 🟡 MEDIUM (do następnej iteracji)

### 1. [Rate Limiting] Brak per-token rate limiting dla public API

**Lokalizacja:**
- `apps/api/src/interfaces/http/public.controller.ts:13`

**Problem:**
Obecny throttling to 30 req/min globally:
```typescript
@Throttle({ default: { limit: 30, ttl: 60000 } })
```

To oznacza:
- Globalny limit dla wszystkich tokenów
- Jeden złośliwy token może wyczerpać limit dla wszystkich użytkowników
- Brak ochrony przed abuse pojedynczego public linka

**Ryzyko:** MEDIUM
- **Prawdopodobieństwo:** MEDIUM (łatwy DoS)
- **Impact:** MEDIUM (DoS dla wszystkich public links)

**Jak naprawić:**

**Opcja 1: Per-token rate limiting**
```typescript
// Custom throttler guard:
@Injectable()
export class PublicTokenThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const token = req.params.token;
    return `public-token:${token}`;
  }
}

// W PublicController:
@UseGuards(PublicTokenThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 req/min per token
export class PublicController {
  // ...
}
```

**Opcja 2: IP + token combined**
```typescript
protected async getTracker(req: Request): Promise<string> {
  const token = req.params.token;
  const ip = req.ip;
  return `public:${token}:${ip}`;
}

// Limits:
// - 100 req/min per token
// - 10 req/min per IP per token
```

---

### 2. [Broken Access Control] Brak auditu użycia public tokens

**Lokalizacja:**
- `apps/api/src/application/public-link/public-link.service.ts:128-154`

**Problem:**
Brak logowania:
- Kiedy token został użyty
- Przez kogo (IP, User-Agent)
- Jakie pliki zostały pobrane
- Ile danych zostało transferowane

To uniemożliwia:
- Wykrywanie abuse
- Compliance audits (GDPR Article 30)
- Analiza security incidents

**Jak naprawić:**

```typescript
// Dodaj model PublicLinkAccessLog:
model PublicLinkAccessLog {
  id            String   @id @default(uuid())
  publicLinkId  String
  ipAddress     String
  userAgent     String?
  query         String?
  documentCount Int
  timestamp     DateTime @default(now())

  publicLink    PublicLink @relation(fields: [publicLinkId], references: [id], onDelete: Cascade)

  @@index([publicLinkId, timestamp])
  @@index([ipAddress])
}

// W PublicLinkService.searchPublic():
async searchPublic(token: string, dto: PublicSearchDto, req?: Request) {
  const link = await this.validateToken(token);

  // ... existing logic ...

  // Log access
  await this.prisma.publicLinkAccessLog.create({
    data: {
      publicLinkId: link.id,
      ipAddress: req?.ip || 'unknown',
      userAgent: req?.headers['user-agent'],
      query: dto.query,
      documentCount: results.length,
    },
  });

  return results;
}
```

---

### 3. [Security Misconfiguration] Brak Content Security Policy dla signed URLs

**Lokalizacja:**
- `apps/api/src/main.ts` (CORS config)

**Problem:**
Signed URLs prowadzą do zewnętrznej domeny (Backblaze S3). Brak CSP może umożliwić:
- XSS przez embedded content w PDF
- Data exfiltration przez PDF forms

**Jak naprawić:**

```typescript
// W main.ts:
import helmet from 'helmet';

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://*.backblazeb2.com'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        objectSrc: ["'none'"], // Block PDF plugins
        frameSrc: ["'none'"],
      },
    },
  }),
);
```

---

### 4. [Insecure Design] Nieograniczony rozmiar transferu danych przez public API

**Lokalizacja:**
- `apps/api/src/application/public-link/public-link.service.ts:172`

**Problem:**
```typescript
const limit = dto.limit || 20;
```

User może ustawić `limit=1000000` i pobrać całą bazę wiedzy workspace'a. Brak:
- Maksymalnego limitu per request
- Throttling transfer size
- Pagination enforcement

**Jak naprawić:**

```typescript
async searchPublic(token: string, dto: PublicSearchDto) {
  // Enforce maximum limit
  const MAX_LIMIT = 100;
  const limit = Math.min(dto.limit || 20, MAX_LIMIT);

  // ... rest of logic ...

  // Track bandwidth usage (optional)
  const estimatedSizeKB = results.reduce((sum, r) => sum + r.content.length, 0) / 1024;
  if (estimatedSizeKB > 10000) { // 10MB
    this.logger.warn(`Large transfer on token ${token}: ${estimatedSizeKB}KB`);
  }
}
```

---

### 5. [Vulnerable Components] Sprawdź dependencies dla @aws-sdk/s3-request-presigner

**Lokalizacja:**
- `apps/api/package.json:29` - `@aws-sdk/client-s3": "^3.712.0`

**Problem:**
AWS SDK może zawierać podatności. Brak regularnego audytu.

**Weryfikacja:**
```bash
cd apps/api
pnpm audit
pnpm why @aws-sdk/client-s3
pnpm why @aws-sdk/s3-request-presigner
```

**Status:** Wymaga weryfikacji (nie udało się uruchomić `npm audit` z powodu braku lockfile)

**Rekomendacja:**
1. Uruchom `pnpm install` aby wygenerować lockfile
2. Regularnie uruchamiaj `pnpm audit`
3. Rozważ Dependabot/Renovate do automatycznych update'ów

---

## 🟢 LOW (nice to have)

### 1. [Code Quality] DRY violation - duplikacja logiki ekstrakcji klucza

**Lokalizacja:**
- `apps/api/src/application/public-link/public-link.service.ts:47`
- `apps/api/src/application/document/document.service.ts:293`

**Problem:**
Ta sama logika `fileUrl.split('/').pop()` w dwóch miejscach.

**Jak naprawić:**

```typescript
// W shared/utils/file-key.util.ts:
export function extractFileKey(fileUrl: string | null): string | null {
  if (!fileUrl) return null;

  const key = fileUrl.split('/').pop();
  if (!key) return null;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
  if (!uuidRegex.test(key)) {
    return null;
  }

  return key;
}

// Usage:
const key = extractFileKey(doc.fileUrl);
if (key) {
  await this.storageService.delete(key);
}
```

---

### 2. [Logging & Monitoring] Brak metryki dla signed URL generation

**Lokalizacja:**
- `apps/api/src/infrastructure/storage/backblaze.service.ts:65`

**Problem:**
Brak logowania:
- Ile signed URLs wygenerowano
- Średni czas generowania
- Błędy AWS API

**Jak naprawić:**

```typescript
async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const startTime = Date.now();

  try {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    const duration = Date.now() - startTime;
    this.logger.debug(`Signed URL generated for ${key} in ${duration}ms`);

    return signedUrl;
  } catch (error) {
    this.logger.error(`Failed to generate signed URL for ${key}`, error);
    throw error;
  }
}
```

---

### 3. [Security Headers] Brak X-Content-Type-Options dla file responses

**Lokalizacja:**
- Response headers dla signed URLs

**Problem:**
Brak `X-Content-Type-Options: nosniff` może prowadzić do MIME-type confusion attacks.

**Jak naprawić:**

```typescript
// W main.ts:
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

---

### 4. [Testing] Brak testów security dla signed URLs

**Problem:**
Brak testów weryfikujących:
1. Signed URL expires po określonym czasie
2. Brak dostępu do plików z innych workspace'ów
3. Invalid key rejection
4. Rate limiting enforcement

**Rekomendacja:**

```typescript
// apps/api/src/application/public-link/__tests__/signed-urls.security.spec.ts

describe('PublicLinkService - Signed URLs Security', () => {
  it('should not generate signed URL for file from different workspace', async () => {
    // Given
    const tokenA = await createPublicLink(workspaceA);
    const documentB = await createDocument(workspaceB, { fileUrl: 'https://...' });

    // When
    const results = await service.searchPublic(tokenA, { query: 'test' });

    // Then
    const fileUrls = results.results.map(r => r.fileUrl);
    expect(fileUrls).not.toContain(expect.stringContaining(documentB.id));
  });

  it('should reject path traversal attempts in file key', async () => {
    // Given
    const maliciousFileUrl = 'https://bucket.s3.com/../../../etc/passwd';

    // When/Then
    const signedUrl = await service['getSignedFileUrl'](maliciousFileUrl);
    expect(signedUrl).toBeNull();
  });

  it('should enforce rate limiting per token', async () => {
    // Given
    const token = await createPublicLink(workspaceA);

    // When - send 31 requests (limit is 30/min)
    const requests = Array(31).fill(null).map(() =>
      request(app).get(`/public/${token}/search`)
    );

    const responses = await Promise.all(requests);

    // Then
    const rateLimited = responses.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

---

### 5. [Documentation] Brak dokumentacji security considerations dla signed URLs

**Problem:**
Developers nie wiedzą:
- Dlaczego signed URLs są używane
- Jakie są ryzyka
- Jak prawidłowo używać

**Rekomendacja:**

```markdown
## Signed URLs - Security Considerations

### Why Signed URLs?

Public API tokens give access to workspace documents, but files are stored
in private S3 bucket. Signed URLs provide temporary, scoped access to files
without exposing S3 credentials.

### Security Model

1. **Token validation**: Public link token must be valid, active, and not expired
2. **RLS enforcement**: Only documents from token's workspace are accessible
3. **Temporary access**: Signed URLs expire after 1 hour
4. **Read-only**: Signed URLs only allow GET operations

### Risks

1. **URL leakage**: Signed URLs contain credentials in query params
   - Mitigation: Short expiry (1h), Referrer-Policy header
2. **File enumeration**: Attackers might enumerate file keys
   - Mitigation: UUID-based keys, rate limiting
3. **Cross-workspace access**: Bug in validation could expose other workspaces
   - Mitigation: RLS, defense-in-depth validation

### Best Practices

- Never log signed URLs (contain credentials)
- Set shortest possible expiry for use case
- Monitor access logs for abuse
- Consider proxying files through backend for sensitive data
```

---

## ✅ Pozytywne aspekty

### 1. Proper use of dependency injection
- `StorageModule` properly imported in `PublicLinkModule`
- `IStorageService` interface abstraction allows swapping storage backends
- Clean Architecture maintained (domain ports, infrastructure adapters)

### 2. Rate limiting already implemented
```typescript
@Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 req/min
export class PublicController
```
Good baseline protection against abuse (needs per-token enhancement)

### 3. RLS context properly maintained
```typescript
return this.prisma.forUser(ownerId, async (tx) => {
  // All queries are workspace-scoped
});
```
Documents are fetched with proper RLS enforcement before generating signed URLs.

### 4. Null safety in file URL handling
```typescript
if (!fileUrl) return null;
const key = fileUrl.split('/').pop();
if (!key) return null;
```
Graceful handling of missing/invalid file URLs.

### 5. Async/await for signed URL generation
```typescript
const documentsWithSignedUrls = await Promise.all(
  documents.map(async (doc) => ({
    fileUrl: await this.getSignedFileUrl(doc.fileUrl),
  })),
);
```
Parallel signed URL generation for performance.

### 6. Clean separation of concerns
- `getSignedFileUrl()` private method in service layer
- Backblaze implementation details isolated in infrastructure
- Port/adapter pattern allows testing with mock storage

### 7. Sensible default expiry
```typescript
async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string>
```
1 hour default is reasonable balance between usability and security.

### 8. Token validation before file access
```typescript
const link = await this.validateToken(token);
// Checks: token exists, isActive, not expired
```
Proper authorization checks before any file operations.

---

## Podsumowanie i Rekomendacje Priorytetowe

### CRITICAL (przed deploy)
**BRAK** - Implementacja nie zawiera podatności blokujących deploy.

### HIGH (przed merge do main)
1. **[HIGH #1] File ownership validation** - Dodaj weryfikację że plik należy do workspace przed generowaniem signed URL (ryzyko IDOR)
2. **[HIGH #2] Timing attack mitigation** - Cache signed URLs lub dodaj constant-time response (ryzyko file enumeration)
3. **[HIGH #3] Referrer policy** - Dodaj `Referrer-Policy: no-referrer` lub skróć expiry do 5min (ryzyko credential leak)

### MEDIUM (do następnej iteracji)
1. **[MED #1]** Per-token rate limiting zamiast globalnego
2. **[MED #2]** Audit logging dla public token usage (compliance)
3. **[MED #3]** Content Security Policy headers
4. **[MED #4]** Enforce maksymalny limit (100) dla dto.limit
5. **[MED #5]** Dependency audit (`pnpm audit`)

### LOW (nice to have)
1. **[LOW #1]** DRY - wyciągnij file key extraction do util
2. **[LOW #2]** Dodaj metryki/logging dla signed URL generation
3. **[LOW #3]** Security headers (X-Content-Type-Options, etc)
4. **[LOW #4]** Security tests dla signed URLs
5. **[LOW #5]** Dokumentacja security considerations

---

## Ostateczna Ocena

**SECURITY SCORE: 7.0/10**

**Uzasadnienie:**
- ✅ Podstawowa implementacja signed URLs jest poprawna (AWS SDK presigner)
- ✅ RLS context jest właściwie utrzymany
- ✅ Rate limiting obecny (choć wymaga ulepszenia)
- ❌ Brak walidacji własności pliku przed signed URL (HIGH risk IDOR)
- ❌ Podatność na timing attacks (file enumeration)
- ❌ Ryzyko credential leak przez Referer headers
- ⚠️ Brak audit logging i security monitoring
- ⚠️ Brak testów security dla nowej funkcjonalności

**RECOMMENDATION: CONDITIONAL APPROVE**

**Warunki przed merge:**
1. ✅ Zaimplementuj HIGH #1 (file ownership validation) - **REQUIRED**
2. ✅ Zaimplementuj HIGH #2 (timing attack mitigation via caching) - **REQUIRED**
3. ✅ Zaimplementuj HIGH #3 (Referrer-Policy header lub skróć expiry) - **REQUIRED**
4. ⚠️ Uruchom `pnpm audit` i napraw HIGH/CRITICAL vulnerabilities - **RECOMMENDED**
5. ⚠️ Dodaj co najmniej 3 security testy dla signed URLs - **RECOMMENDED**

**Dopiero po:**
Wszystkie HIGH findings naprawione - **READY FOR PRODUCTION**

---

## Następne kroki (sugerowane)

### Natychmiast (pre-merge)
1. Dodaj validation w `getSignedFileUrl()`:
   ```typescript
   // Validate UUID format
   // Verify file belongs to workspace (via database query)
   ```

2. Dodaj Referrer-Policy header:
   ```typescript
   // W main.ts
   app.use((req, res, next) => {
     res.setHeader('Referrer-Policy', 'no-referrer');
     next();
   });
   ```

3. Skróć expiry signed URLs do 5 minut:
   ```typescript
   return this.storageService.getSignedUrl(key, 300); // 5min
   ```

### Krótkoterminowo (1-2 tygodnie)
1. Implement per-token rate limiting
2. Add audit logging dla public API usage
3. Write security tests (file ownership, rate limiting, path traversal)
4. Dependency audit i update

### Długoterminowo (backlog)
1. Rozważ proxy files przez backend (eliminuje signed URL exposure)
2. Dodaj bandwidth monitoring i alerting
3. Implement CSP headers dla całej aplikacji
4. Security documentation dla developers

---

**Signature:** Security Review Agent
**Date:** 2025-12-25 15:00
**Review Version:** 1.0
**Next Review:** Po implementacji HIGH findings
