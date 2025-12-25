# Architecture Review Report - 2025-12-25-15-00

## Kontekst

- **Moduł:** Public Link (application layer)
- **Bounded Context:** ACCESS CONTEXT (z specs: public access przez tokeny)
- **Przeczytane specyfikacje:**
  - `SPEC-001-row-level-security.md` - RLS implementation
  - `docs/specifications/2025-12-24-knowledge-forge.md` - główna specyfikacja MVP
  - `CLAUDE.md` - zasady inżynieryjne projektu
- **Zmiany:** Implementacja signed URLs dla plików PDF w publicznym dostępie
- **Powiązane przepływy:**
  - UC4: Pobieranie treści przez publiczny link (z specs)
  - Public API endpoints (bez autentykacji, token-based)

### Zmienione pliki

1. `apps/api/src/application/public-link/public-link.service.ts`
   - Dodano `IStorageService` injection
   - Dodano metodę `getSignedFileUrl()`
   - Usunięto `IPublicLinkRepository` injection (zmiana na bezpośrednie użycie Prisma)
   - Refaktoryzacja wszystkich metod na używanie RLS (`forUser()`, `withoutRls()`)
   - Generowanie signed URLs dla plików w odpowiedziach API

2. `apps/api/src/application/public-link/public-link.module.ts`
   - Dodano import `StorageModule`

3. `apps/api/src/application/document/document.service.ts`
   - Migracja na RLS (`forUser()`, `withoutRls()`)
   - Helper `ensureTagsWithTx()` dla transakcji z RLS

---

## CRITICAL (łamie fundamentalne zasady)

### 1. Naruszenie Clean Architecture - Application Layer ma zależność od Infrastructure

**Problem:**
```typescript
// public-link.service.ts
@Inject(STORAGE_SERVICE)
private readonly storageService: IStorageService,
```

`PublicLinkService` (application layer) bezpośrednio wstrzykuje `IStorageService`, który jest interfejsem domenowym (`domain/document/storage.port.ts`), ale dotyczy funkcjonalności infrastrukturalnej.

**Zgodnie z Clean Architecture:**
```
Application Layer → Domain Layer (OK)
Application Layer → Infrastructure Layer (NARUSZENIE)
```

**Analiza:**
- Port `IStorageService` jest w `domain/document/` - to DOBRZE (DIP)
- Implementacja `BackblazeStorageService` jest w `infrastructure/storage/` - to DOBRZE
- Application layer używa portu - to jest AKCEPTOWALNE w Clean Architecture z DDD

**Verdict: FALSE ALARM**

To jest poprawne użycie **Dependency Inversion Principle (SOLID)** i **Ports & Adapters**. Application layer zależy od abstrakcji (port) z domain layer, nie od konkretnej implementacji z infrastructure.

---

## HIGH (poważne naruszenie)

### 1. Usunięcie Repository Pattern - naruszenie architektury warstwowej

**Problem:**

Przed zmianą:
```typescript
// public-link.service.ts (old)
@Inject(PUBLIC_LINK_REPOSITORY)
private readonly publicLinkRepository: IPublicLinkRepository,

// Użycie
return this.publicLinkRepository.create({...});
```

Po zmianie:
```typescript
// public-link.service.ts (new)
private readonly prisma: PrismaService,

// Użycie
return this.prisma.forUser(userId, async (tx) => {
  return tx.publicLink.create({...});
});
```

**Naruszenie:**
- Application layer ma BEZPOŚREDNIĄ zależność od `PrismaService` (infrastructure)
- Pominięcie repository abstraction łamie Clean Architecture
- Repository pattern był poprawnie zaimplementowany (`IPublicLinkRepository`), ale został usunięty

**Zgodność z CLAUDE.md:**
> "2. Wykorzystuj: DDD, SOLID, DI, Clean Code, Clean Architecture."
> Struktura: `domain/` (entities, interfaces), `application/` (services), `infrastructure/` (adapters)

**Jak naprawić:**

**Opcja A: Przywróć Repository Pattern z RLS**

```typescript
// domain/public-link/public-link.repository.ts
export interface IPublicLinkRepository {
  // Existing methods + new RLS-aware methods
  createWithUser(userId: string, data: CreatePublicLinkData): Promise<PublicLink>;
  findAllWithUser(userId: string, workspaceId: string): Promise<PublicLink[]>;
  // ...
}

// infrastructure/persistence/repositories/public-link.repository.impl.ts
@Injectable()
export class PrismaPublicLinkRepository implements IPublicLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithUser(userId: string, data: CreatePublicLinkData): Promise<PublicLink> {
    return this.prisma.forUser(userId, async (tx) => {
      return tx.publicLink.create({ data: {...} });
    });
  }
}

// application/public-link/public-link.service.ts
@Injectable()
export class PublicLinkService {
  constructor(
    @Inject(PUBLIC_LINK_REPOSITORY)
    private readonly publicLinkRepository: IPublicLinkRepository,
    // ...
  ) {}

  async create(workspaceId: string, userId: string, dto: CreatePublicLinkDto): Promise<PublicLink> {
    await this.workspaceService.ensureMember(workspaceId, userId);
    // ... validation ...
    const token = randomBytes(32).toString('hex');
    return this.publicLinkRepository.createWithUser(userId, { workspaceId, token, ... });
  }
}
```

**Opcja B: Jeśli RLS wymaga bezpośredniego dostępu do Prisma, stwórz dedykowany adapter**

```typescript
// infrastructure/persistence/prisma/prisma-rls.adapter.ts
@Injectable()
export class PrismaRlsAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async executeWithUser<T>(
    userId: string,
    operation: (tx: TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.forUser(userId, operation);
  }

  async executeWithoutRls<T>(
    operation: (tx: TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.withoutRls(operation);
  }
}

// application/public-link/public-link.service.ts
constructor(
  @Inject(PUBLIC_LINK_REPOSITORY)
  private readonly publicLinkRepository: IPublicLinkRepository,
  private readonly rlsAdapter: PrismaRlsAdapter,
) {}
```

**Rekomendacja:** Opcja A. Repository pattern z RLS-aware metodami zachowuje Clean Architecture i izoluje application layer od szczegółów persistencji.

---

### 2. Niejednolita obsługa błędów w getSignedFileUrl()

**Problem:**
```typescript
private async getSignedFileUrl(fileUrl: string | null): Promise<string | null> {
  if (!fileUrl) return null;
  const key = fileUrl.split('/').pop();
  if (!key) return null;
  return this.storageService.getSignedUrl(key);
}
```

**Naruszenie:**
- Metoda może zwrócić `null` lub rzucić wyjątek (z `storageService.getSignedUrl()`)
- Brak error handling - co jeśli `getSignedUrl()` rzuci błąd?
- Cicha awaria (zwrócenie `null`) vs głośna awaria (exception) - niespójność

**Jak naprawić:**

```typescript
private async getSignedFileUrl(fileUrl: string | null): Promise<string | null> {
  if (!fileUrl) return null;

  const key = fileUrl.split('/').pop();
  if (!key) {
    this.logger.warn(`Invalid fileUrl format: ${fileUrl}`);
    return null;
  }

  try {
    return await this.storageService.getSignedUrl(key);
  } catch (error) {
    this.logger.error(`Failed to generate signed URL for key: ${key}`, error);
    // Strategia: zwróć null (degradacja) lub rzuć błąd (fail-fast)
    return null; // Dla public API - degradacja jest lepsza
  }
}
```

---

## MEDIUM (do poprawy)

### 1. Ekstrakacja klucza pliku - naiwna implementacja

**Problem:**
```typescript
const key = fileUrl.split('/').pop();
```

**Naruszenie:**
- Zakłada format URL `https://bucket.endpoint/key`
- Nie obsługuje URL z query params: `https://bucket.endpoint/key?v=123`
- Nie obsługuje URL z paths: `https://bucket.endpoint/prefix/subdir/key`
- Logika biznesowa wiedzy o strukturze URL w niewłaściwym miejscu

**Jak naprawić:**

```typescript
// domain/document/storage.port.ts
export interface IStorageService {
  upload(...): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  // Nowa metoda
  extractKeyFromUrl(url: string): string | null;
}

// infrastructure/storage/backblaze.service.ts
extractKeyFromUrl(url: string): string | null {
  try {
    // Parsowanie URL i wydobycie klucza według strategii storage
    const parsedUrl = new URL(url);
    // Dla Backblaze: path bez leading slash
    return parsedUrl.pathname.substring(1);
  } catch {
    return null;
  }
}

// application/public-link/public-link.service.ts
private async getSignedFileUrl(fileUrl: string | null): Promise<string | null> {
  if (!fileUrl) return null;

  const key = this.storageService.extractKeyFromUrl(fileUrl);
  if (!key) return null;

  try {
    return await this.storageService.getSignedUrl(key);
  } catch (error) {
    this.logger.error(`Failed to generate signed URL`, error);
    return null;
  }
}
```

**Rekomendacja:** Przenieś logikę ekstrakacji klucza do storage service (Single Responsibility).

---

### 2. Brak walidacji workspaceId typu w validateToken()

**Problem:**
```typescript
async validateToken(token: string): Promise<PublicLink & { workspace: { id: string; name: string; createdById: string } }> {
  const results = await this.prisma.withoutRls(async (tx) => {
    return tx.publicLink.findFirst({
      where: { token },
      include: { workspace: { select: { id: true, name: true, createdById: true } } },
    });
  });

  if (!results) {
    throw new NotFoundException('Invalid token');
  }
  // ...
}
```

**Naruszenie:**
- `workspace.createdById` może być null/undefined (brak walidacji)
- Używane później jako `ownerId` w metodach `getPublicDocuments()` i `searchPublic()`
- Potencjalny runtime error jeśli workspace nie ma `createdById`

**Jak naprawić:**

```typescript
async validateToken(token: string): Promise<PublicLink & { workspace: { id: string; name: string; createdById: string } }> {
  const results = await this.prisma.withoutRls(async (tx) => {
    return tx.publicLink.findFirst({
      where: { token },
      include: { workspace: { select: { id: true, name: true, createdById: true } } },
    });
  });

  if (!results) {
    throw new NotFoundException('Invalid token');
  }

  if (!results.workspace?.createdById) {
    this.logger.error(`Workspace ${results.workspaceId} missing createdById`);
    throw new InternalServerErrorException('Invalid workspace configuration');
  }

  if (!results.isActive) {
    throw new ForbiddenException('Link is inactive');
  }

  if (results.expiresAt && results.expiresAt < new Date()) {
    throw new ForbiddenException('Link has expired');
  }

  return results as PublicLink & { workspace: { id: string; name: string; createdById: string } };
}
```

---

### 3. Brak testów dla signed URLs

**Problem:**
Zgodnie z CLAUDE.md:
> "3. Zawsze pisz testy najpierw (TDD). Stub > mock. Nie testuj implementacji, testuj zachowanie."

Brak testów dla:
- `getSignedFileUrl()` helper
- Generowanie signed URLs w `getPublicDocuments()`
- Generowanie signed URLs w `searchPublic()`
- Error handling dla storage service failures

**Jak naprawić:**

Stwórz testy (TDD style):

```typescript
// test/unit/public-link.service.spec.ts

describe('PublicLinkService - Signed URLs', () => {
  describe('getPublicDocuments', () => {
    it('should return signed URLs for documents with files', async () => {
      // Given
      const mockToken = 'valid-token';
      const mockSignedUrl = 'https://signed.url/file.pdf?signature=xyz';

      storageService.getSignedUrl.mockResolvedValue(mockSignedUrl);

      // When
      const result = await service.getPublicDocuments(mockToken, {});

      // Then
      expect(result.documents[0].fileUrl).toBe(mockSignedUrl);
      expect(storageService.getSignedUrl).toHaveBeenCalledWith('file-key');
    });

    it('should return null for documents without files', async () => {
      // Given - document without fileUrl

      // When
      const result = await service.getPublicDocuments(mockToken, {});

      // Then
      expect(result.documents[0].fileUrl).toBeNull();
      expect(storageService.getSignedUrl).not.toHaveBeenCalled();
    });

    it('should handle storage service failures gracefully', async () => {
      // Given
      storageService.getSignedUrl.mockRejectedValue(new Error('S3 error'));

      // When
      const result = await service.getPublicDocuments(mockToken, {});

      // Then
      expect(result.documents[0].fileUrl).toBeNull(); // Degradacja
    });
  });
});
```

**Rekomendacja:** Dodaj testy jednostkowe przed mergem do main.

---

### 4. Performance - N+1 problem w generowaniu signed URLs

**Problem:**
```typescript
const documentsWithSignedUrls = await Promise.all(
  documents.map(async (doc) => ({
    id: doc.id,
    title: doc.title,
    // ...
    fileUrl: await this.getSignedFileUrl(doc.fileUrl),
  })),
);
```

**Naruszenie:**
- Dla 20 dokumentów = 20 wywołań `getSignedUrl()`
- Każde wywołanie to potencjalnie osobny request do S3 API
- Backblaze B2 może throttlować przy dużej liczbie requestów

**Ocena:**
- To nie jest klasyczny N+1 (database queries), ale podobny problem
- Dla publicznego API z limitem 20 wyników - akceptowalne
- Dla większych limitów może być problem

**Opcjonalna optymalizacja:**

```typescript
// domain/document/storage.port.ts
export interface IStorageService {
  // ...
  getSignedUrlsBatch(keys: string[], expiresInSeconds?: number): Promise<Map<string, string>>;
}

// infrastructure/storage/backblaze.service.ts
async getSignedUrlsBatch(keys: string[], expiresInSeconds = 3600): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Batch generation (może być parallelizowane)
  await Promise.all(
    keys.map(async (key) => {
      const url = await this.getSignedUrl(key, expiresInSeconds);
      results.set(key, url);
    })
  );

  return results;
}
```

**Rekomendacja:** Monitoruj performance w production. Jeśli threshold przekroczony - zaimplementuj batch generation.

---

## LOW (sugestia)

### 1. Brak konfiguracji expiration time dla signed URLs

**Problem:**
```typescript
return this.storageService.getSignedUrl(key); // Domyślnie 3600s (1h)
```

**Sugestia:**
- Hardcoded timeout w `BackblazeStorageService` (3600s)
- Brak możliwości konfiguracji per środowisko (dev vs prod)
- Publiczne linki mogą mieć własną politykę expiration

**Jak ulepszyć:**

```typescript
// application/public-link/public-link.service.ts
private async getSignedFileUrl(fileUrl: string | null): Promise<string | null> {
  if (!fileUrl) return null;
  const key = fileUrl.split('/').pop();
  if (!key) return null;

  // Konfigurowalny timeout - np. z ConfigService
  const expiresIn = this.configService.get('PUBLIC_FILE_URL_EXPIRES', 3600);
  return this.storageService.getSignedUrl(key, expiresIn);
}
```

---

### 2. Type safety - type assertion w validateToken()

**Problem:**
```typescript
return results as PublicLink & { workspace: { id: string; name: string; createdById: string } };
```

**Sugestia:**
- Type assertion (`as`) omija type checking
- Lepiej użyć type guard lub zod/yup schema validation

**Jak ulepszyć:**

```typescript
// domain/public-link/public-link.types.ts
import { z } from 'zod';

const ValidatedPublicLinkSchema = z.object({
  id: z.string(),
  token: z.string(),
  workspaceId: z.string(),
  // ... inne pola z PublicLink
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    createdById: z.string(), // Wymuszamy non-null
  }),
});

export type ValidatedPublicLink = z.infer<typeof ValidatedPublicLinkSchema>;

// application/public-link/public-link.service.ts
async validateToken(token: string): Promise<ValidatedPublicLink> {
  const results = await this.prisma.withoutRls(async (tx) => {
    return tx.publicLink.findFirst({
      where: { token },
      include: { workspace: { select: { id: true, name: true, createdById: true } } },
    });
  });

  if (!results) {
    throw new NotFoundException('Invalid token');
  }

  // Runtime validation
  try {
    const validated = ValidatedPublicLinkSchema.parse(results);

    if (!validated.isActive) {
      throw new ForbiddenException('Link is inactive');
    }

    if (validated.expiresAt && validated.expiresAt < new Date()) {
      throw new ForbiddenException('Link has expired');
    }

    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      this.logger.error('Invalid public link data structure', error.errors);
      throw new InternalServerErrorException('Invalid link configuration');
    }
    throw error;
  }
}
```

**Rekomendacja:** Dodaj runtime validation dla krytycznych danych (opcjonalnie, priorytet niski).

---

### 3. Logging - brak audit trail dla signed URL generation

**Problem:**
Brak logowania generowania signed URLs dla plików

**Sugestia:**
```typescript
private async getSignedFileUrl(fileUrl: string | null): Promise<string | null> {
  if (!fileUrl) return null;

  const key = fileUrl.split('/').pop();
  if (!key) return null;

  try {
    const signedUrl = await this.storageService.getSignedUrl(key);

    // Audit log dla security
    this.logger.log({
      event: 'SIGNED_URL_GENERATED',
      key,
      timestamp: new Date().toISOString(),
    });

    return signedUrl;
  } catch (error) {
    this.logger.error(`Failed to generate signed URL for key: ${key}`, error);
    return null;
  }
}
```

**Rekomendacja:** Dodaj logging dla compliance i debugging.

---

## Dobre praktyki

### 1. Dependency Inversion Principle (SOLID) - poprawne użycie

**Co jest dobrze:**
```typescript
// domain/document/storage.port.ts
export interface IStorageService {
  upload(...): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

// application/public-link/public-link.service.ts
constructor(
  @Inject(STORAGE_SERVICE)
  private readonly storageService: IStorageService,
) {}
```

Application layer zależy od abstrakcji (port) z domain layer, nie od konkretnej implementacji. To jest **wzorcowe użycie DIP**.

---

### 2. RLS Context Management - poprawne użycie workspace owner context

**Co jest dobrze:**
```typescript
// Publiczny dostęp używa kontekstu właściciela workspace
const ownerId = link.workspace.createdById;

return this.prisma.forUser(ownerId, async (tx) => {
  const documents = await tx.document.findMany({ where });
  // RLS automatycznie filtruje po workspace owner
});
```

**Zgodność z SPEC-001:**
> "Public API - osobny mechanizm (token-based, bypass RLS)"

Implementacja używa kontekstu właściciela workspace zamiast całkowitego bypass RLS - to jest **bardziej bezpieczne** niż pierwotna specyfikacja.

---

### 3. Async/Await z Promise.all - optymalizacja performance

**Co jest dobrze:**
```typescript
const [documents, totalCount] = await Promise.all([
  tx.document.findMany({ where, ... }),
  tx.document.count({ where }),
]);
```

Równoległe wykonywanie queries - dobra praktyka optymalizacji.

---

### 4. Token validation - comprehensive checks

**Co jest dobrze:**
```typescript
if (!results.isActive) {
  throw new ForbiddenException('Link is inactive');
}

if (results.expiresAt && results.expiresAt < new Date()) {
  throw new ForbiddenException('Link has expired');
}
```

Walidacja stanu linku (aktywny, niewygasły) - defense in depth.

---

### 5. Error handling z odpowiednimi HTTP status codes

**Co jest dobrze:**
```typescript
throw new NotFoundException('Invalid token');        // 404
throw new ForbiddenException('Link is inactive');    // 403
throw new BadRequestException('Invalid expiration'); // 400
```

Użycie semantycznych wyjątków NestJS - zgodność z REST best practices.

---

## Zgodność z ADR

**Brak katalogu ADR** w projekcie. Zalecam utworzenie:

```
docs/adr/
├── 001-row-level-security.md (z SPEC-001)
├── 002-signed-urls-for-public-access.md (z tej zmiany)
├── 003-repository-pattern-with-rls.md (decyzja o tym czy trzymać czy usunąć repositories)
```

**Format ADR:**
```markdown
# ADR-002: Signed URLs for Public File Access

## Status
Accepted

## Context
Public API needs to provide access to files stored in Backblaze B2.
Direct URLs expose files permanently, signed URLs provide time-limited access.

## Decision
Use AWS S3-compatible signed URLs (pre-signed GET requests) with 1h expiration.

## Consequences
- **Positive:** Files are protected, access is time-limited
- **Negative:** Additional latency for URL generation, dependency on storage service availability
- **Risks:** Clock drift between client/server, URL expiration during download
```

---

## Podsumowanie

### Statystyki

| Kategoria | Liczba | Status |
|-----------|--------|--------|
| CRITICAL | 0 | - |
| HIGH | 2 | Wymaga natychmiastowej akcji |
| MEDIUM | 4 | Do poprawy przed merge |
| LOW | 3 | Nice to have |
| Dobre praktyki | 5 | Zachować |

### Najważniejsze akcje (priorytet)

1. **HIGH-1:** Przywróć Repository Pattern z RLS-aware metodami
2. **HIGH-2:** Dodaj error handling w `getSignedFileUrl()`
3. **MEDIUM-2:** Walidacja `createdById` w `validateToken()`
4. **MEDIUM-3:** Napisz testy jednostkowe (TDD principle z CLAUDE.md)

### Rekomendacja finalna

**Status:** CONDITIONALLY APPROVE (wymaga poprawek przed merge do main)

**Następne kroki:**
1. Refaktoryzacja do Repository Pattern (HIGH-1)
2. Dodanie error handling (HIGH-2)
3. Walidacja danych (MEDIUM-2)
4. Testy jednostkowe (MEDIUM-3)
5. Stworzenie ADR-002 dokumentującego decyzję o signed URLs

**Timeline:** 4-6h pracy (1 dev)

---

## Appendix: Clean Architecture Compliance

```
┌─────────────────────────────────────────────────────────┐
│                     KNOWLEDGE FORGE                     │
│                  Clean Architecture Map                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ DOMAIN LAYER (Core Business Logic)             │   │
│  │ ✅ storage.port.ts (IStorageService interface)  │   │
│  │ ✅ No infrastructure dependencies               │   │
│  └─────────────────────────────────────────────────┘   │
│                        ▲                                │
│                        │ Depends on (OK)               │
│                        │                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ APPLICATION LAYER (Use Cases)                   │   │
│  │ ⚠️  PublicLinkService                           │   │
│  │    ├─ ✅ Depends on IStorageService (port)      │   │
│  │    └─ ❌ Depends on PrismaService (infra)       │   │
│  │                                                  │   │
│  │ SHOULD: Use IPublicLinkRepository (port)        │   │
│  └─────────────────────────────────────────────────┘   │
│                        ▲                                │
│                        │ Implements (OK)               │
│                        │                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ INFRASTRUCTURE LAYER (Technical Details)        │   │
│  │ ✅ BackblazeStorageService (implements port)    │   │
│  │ ✅ PrismaService (RLS wrapper)                  │   │
│  │ ⚠️  PrismaPublicLinkRepository (unused)         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘

Legend:
✅ Zgodne z architekturą
⚠️  Wymaga poprawy
❌ Naruszenie architektury
```

---

**Reviewer:** Architecture Review Agent
**Data:** 2025-12-25 15:00
**Wersja:** 1.0
