# Test Review Report - 2025-12-24

**Reviewer:** Test Reviewer Agent
**Project:** Knowledge Forge MVP
**Review Date:** 2025-12-24 14:00
**Commit:** Initial MVP commit (pre-commit)
**Status:** CRITICAL - BLOCKS MERGE

---

## Executive Summary

BRAK TESTÓW - projekt jest w fazie MVP po implementacji wszystkich kluczowych funkcjonalności (Fazy 1-4 z specyfikacji), ale NIE POSIADA ŻADNYCH TESTÓW JEDNOSTKOWYCH ANI INTEGRACYJNYCH.

Zgodnie z CLAUDE.md:
> "Zawsze pisz testy najpierw (TDD). Stub > mock. Nie testuj implementacji, testuj zachowanie."

Specyfikacja w punkcie 10 MVP Scope - Faza 1 wymaga:
- [ ] Testy jednostkowe

Projekt NIE SPEŁNIA podstawowych wymagań TDD określonych w dokumentacji projektowej.

---

## Test Execution

- Testy przeszły: 0/0
- Testy nie przeszły: N/A
- Coverage: 0%
- Test framework: Jest (skonfigurowany)
- Status: No tests found (brak plików .spec.ts lub .test.ts)

### Test Setup

Configuration: POPRAWNA

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "collectCoverageFrom": ["**/*.(t|j)s"],
  "coverageDirectory": "../coverage",
  "testEnvironment": "node",
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/$1"
  }
}
```

Dependencies: KOMPLETNE
- @nestjs/testing: 10.4.15
- jest: 29.7.0
- ts-jest: 29.2.5

---

## Kontekst

### Sprawdzone moduły
- Authentication (auth.service.ts)
- Workspace Management (workspace.service.ts)
- Document Management (document.service.ts)
- Chunking (chunking.service.ts)
- Search/RAG (search.service.ts)
- Public Links (public-link.service.ts)
- Infrastructure: OpenAI Embeddings, OpenAI LLM, Backblaze Storage

### Powiązane przepływy z ecosystem.md
Projekt nie posiada `docs/ecosystem.md` - jest to nowy projekt Knowledge Forge (nie Frontdesk), więc stosujemy zasady z CLAUDE.md i specyfikacji 2025-12-24-knowledge-forge.md.

**Kluczowe Use Cases wymagające testów (z specyfikacji):**
1. UC1: Zapisanie zweryfikowanego źródła
2. UC2: Zapisanie niezweryfikowanego źródła
3. UC3: Generowanie publicznego linku
4. UC4: Pobieranie treści przez publiczny link
5. UC5: Przeglądanie treści przez usera

---

## CRITICAL (blokuje merge)

### 1. [MISSING TESTS] Brak testów jednostkowych dla logiki biznesowej

**Problem:** Wszystkie application services (auth, workspace, document, chunking, search, public-link) nie mają testów.

**Gdzie:**
- `apps/api/src/application/auth/auth.service.ts`
- `apps/api/src/application/workspace/workspace.service.ts`
- `apps/api/src/application/document/document.service.ts`
- `apps/api/src/application/chunking/chunking.service.ts`
- `apps/api/src/application/search/search.service.ts`
- `apps/api/src/application/public-link/public-link.service.ts`

**Jak naprawić:**
Dla każdego serwisu stworzyć plik `*.service.spec.ts` z testami zachowania (nie implementacji).

### 2. [MISSING TESTS] Brak testów dla adapterów infrastruktury

**Problem:** Infrastructure adapters (OpenAI, Backblaze) nie mają testów integracyjnych.

**Gdzie:**
- `apps/api/src/infrastructure/embeddings/openai-embeddings.service.ts`
- `apps/api/src/infrastructure/llm/openai-llm.service.ts`
- `apps/api/src/infrastructure/storage/backblaze.service.ts`

**Jak naprawić:**
Zgodnie z CLAUDE.md: "Mockuj tylko zewnętrzne API". Stworzyć testy z mockowanymi klientami OpenAI i S3.

### 3. [TDD VIOLATION] Kod napisany bez TDD

**Problem:** Cały kod powstał bez podejścia Test-Driven Development, co narusza podstawową zasadę z CLAUDE.md.

**Jak naprawić:**
Natychmiast dodać testy przed merge'em. W przyszłości stosować TDD (test-first approach).

---

## HIGH (powinno być naprawione)

### 1. [SECURITY] Brak testów dla autoryzacji i uprawnień

**Problem:**
- `workspace.service.ts` ma metody `ensureMember()` i `ensureOwner()` - kluczowe dla bezpieczeństwa
- `auth.service.ts` ma logikę walidacji haseł i tokenów JWT
- Brak testów może prowadzić do luk bezpieczeństwa

**Jak naprawić:**
Priorytetowo przetestować:
- Czy użytkownik może wykonywać operacje tylko w workspace'ach, do których należy
- Czy tylko OWNER może usuwać workspace/members
- Czy hasła są prawidłowo hashowane (bcrypt)
- Czy JWT są prawidłowo generowane i walidowane

### 2. [DATA INTEGRITY] Brak testów dla przetwarzania dokumentów

**Problem:**
`document.service.ts` ma asynchroniczną metodę `processDocument()` która:
- Chunuje dokumenty
- Generuje embeddingi (kosztowne wywołania API OpenAI)
- Zapisuje do bazy przez raw SQL
- Może zawieść i oznaczyć dokument jako FAILED

Brak testów = ryzyko utraty danych lub błędnego przetwarzania.

**Jak naprawić:**
Testy powinny weryfikować:
- Poprawność całego flow: upload → parse → chunk → embed → store
- Obsługę błędów (co się stanie gdy OpenAI API nie działa?)
- Czy chunki są prawidłowo zapisywane z embeddingami
- Czy status dokumentu jest aktualizowany (PENDING → PROCESSING → COMPLETED/FAILED)

### 3. [BUSINESS LOGIC] Brak testów dla logiki tagów

**Problem:**
`document.service.ts` ma metodę `ensureTags()` która normalizuje tagi (lowercase, replace special chars).

**Przykład:**
```typescript
private async ensureTags(tagNames: string[]) {
  const normalizedNames = tagNames.map((name) =>
    name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
  );
  // ...
}
```

Bez testów nie wiemy czy:
- "Support & Help" → "support--help" (podwójny myślnik)
- "Frontend Development" → "frontend-development"
- "" (pusty string) → ?

**Jak naprawić:**
Unit test dla `ensureTags` z różnymi edge cases.

---

## MEDIUM (do poprawy)

### 1. [CHUNKING STRATEGY] Brak testów dla strategii chunkowania

**Problem:**
`chunking.service.ts` implementuje 3 strategie:
1. No-split (< 1000 tokenów)
2. LLM smart chunking (1000-10000 tokenów)
3. Hierarchical chunking (> 10000 tokenów)

Każda strategia ma różną logikę, a brak testów = nie wiemy czy działają poprawnie.

**Jak naprawić:**
Testy dla każdej strategii:
- Small doc → 1 chunk
- Medium doc → LLM chunking (mockować OpenAI)
- Large doc → hierarchical split
- Fallback gdy LLM chunking fails → fixed-size chunking

### 2. [FILE PARSING] Brak testów dla parserów

**Problem:**
`chunking.service.ts` ma parsery dla PDF, DOCX, TXT, MD.

```typescript
async parseFile(buffer: Buffer, mimeType: string): Promise<string>
```

Bez testów nie wiemy czy:
- PDF z obrazami jest prawidłowo parsowany
- DOCX zachowuje strukturę
- Unsupported MIME type rzuca błąd

**Jak naprawić:**
Testy z sample files (fixtures):
- sample.pdf → expected text
- sample.docx → expected text
- sample.unsupported → throws error

### 3. [SEARCH] Brak testów dla RAG search

**Problem:**
`search.service.ts` używa pgvector dla similarity search z raw SQL:

```typescript
await this.prisma.$queryRawUnsafe<...>(`
  SELECT ... FROM "Chunk" c
  WHERE c.embedding <=> '${JSON.stringify(embedding)}'::vector
  ...
`)
```

Problemy:
- Raw SQL = ryzyko SQL injection (choć workspaceId to UUID)
- Brak testów = nie wiemy czy similarity search działa
- Filtrowanie po tagach i verification status

**Jak naprawić:**
Integration tests z testową bazą:
- Dodać sample dokumenty z embeddingami
- Query: "reklamacja" → powinien znaleźć dokument o reklamacjach
- Query z tagami → filtrowanie działa
- includeUnverified = false → tylko VERIFIED docs

### 4. [PUBLIC API] Brak testów dla public links

**Problem:**
`public-link.service.ts` ma logikę:
- Walidacji tokenów
- Sprawdzania expiresAt
- Filtrowania po allowedTags

Bez testów = ryzyko wycieków danych (użytkownik może pobrać więcej niż powinien).

**Jak naprawić:**
Testy:
- Token expired → ForbiddenException
- Token inactive → ForbiddenException
- allowedTags: ["support"] + query tags: ["billing"] → empty results
- allowedTags: [] → wszystkie tagi dostępne

---

## LOW (sugestia)

### 1. [TEST ORGANIZATION] Brak struktury testów

**Sugestia:**
Dodać katalogi:
```
apps/api/
├── test/
│   ├── fixtures/          # Sample PDFs, DOCX, etc.
│   ├── stubs/             # Stub implementations
│   └── integration/       # E2E tests (przyszłość)
```

### 2. [COVERAGE THRESHOLD] Brak minimalnego progu coverage

**Sugestja:**
Dodać do `package.json`:
```json
"jest": {
  "coverageThreshold": {
    "global": {
      "branches": 70,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

### 3. [CI/CD] Brak testów w pipeline

**Sugestia:**
Dodać GitHub Actions / GitLab CI config z:
```yaml
- npm run test
- npm run test:cov
```

---

## Dobre praktyki

Brak - nie ma testów do oceny.

**Pozytywne aspekty infrastruktury testowej:**
- Jest framework jest prawidłowo skonfigurowany
- ts-jest dla TypeScript
- @nestjs/testing w dependencies
- Module path mapping (@/) skonfigurowany
- Test scripts w package.json

---

## Brakujące testy (TYLKO dla używanego kodu)

Wszystkie poniższe komponenty są aktywnie używane w aplikacji (zweryfikowano przez grep).

### Application Layer (Use Cases)

| Plik | Typ testu | Co przetestować | Gdzie używane |
|------|-----------|-----------------|---------------|
| auth.service.ts | Unit + Integration | register: email już istnieje, hash hasła; login: invalid credentials, valid JWT; validateUser | auth.controller.ts |
| workspace.service.ts | Unit + Integration | create: tworzenie z OWNER; ensureMember/ensureOwner: ForbiddenException; removeMember: nie można usunąć siebie | workspace.controller.ts, document.service.ts |
| document.service.ts | Integration | create: upload file + parse + process; processDocument: chunking + embeddings + storage; ensureTags: normalizacja; update: reprocessing gdy content zmieniony | document.controller.ts |
| chunking.service.ts | Unit + Integration | parseFile: PDF/DOCX/TXT/MD; chunk: strategia no-split/llm/hierarchical; fixedSizeChunk: overlap + sentence boundary | document.service.ts |
| search.service.ts | Integration | search: semantic similarity, tag filtering, verification status; pgvector query | search.controller.ts |
| public-link.service.ts | Unit + Integration | validateToken: expired/inactive; getPublicDocuments: tag filtering; searchPublic: semantic search | public.controller.ts |

### Infrastructure Layer (Adapters)

| Plik | Typ testu | Co przetestować | Gdzie używane |
|------|-----------|-----------------|---------------|
| openai-embeddings.service.ts | Integration (mock OpenAI) | generateEmbedding: pojedynczy tekst; generateEmbeddings: batch; error handling | document.service.ts, search.service.ts, public-link.service.ts |
| openai-llm.service.ts | Integration (mock OpenAI) | smartChunk: JSON parsing, chunk validation; complete: prompt handling; error handling | chunking.service.ts |
| backblaze.service.ts | Integration (mock S3) | upload: generowanie UUID key, sanitization; delete: usuwanie pliku; getSignedUrl: presigned URL | document.service.ts |
| prisma.service.ts | Integration | connection, onModuleInit/onModuleDestroy | Wszystkie serwisy |

### Domain Ports

| Plik | Typ testu | Co przetestować | Gdzie używane |
|------|-----------|-----------------|---------------|
| embeddings.port.ts | - | Interface - nie wymaga testów | - |
| llm.port.ts | - | Interface - nie wymaga testów | - |
| storage.port.ts | - | Interface - nie wymaga testów | - |

### DTOs

DTOs używają class-validator, wymaga testów walidacji:

| Plik | Typ testu | Co przetestować | Gdzie używane |
|------|-----------|-----------------|---------------|
| auth.dto.ts | Unit | RegisterDto: email format, password length; LoginDto: required fields | auth.controller.ts |
| workspace.dto.ts | Unit | CreateWorkspaceDto: name required; AddMemberDto: userId UUID | workspace.controller.ts |
| document.dto.ts | Unit | CreateDocumentDto: title required, verificationStatus enum; UpdateDocumentDto: partial validation | document.controller.ts |
| search.dto.ts | Unit | SearchDto: query required, limit max value | search.controller.ts, public.controller.ts |
| public-link.dto.ts | Unit | CreatePublicLinkDto: expiresAt future date, allowedTags array | public-link.controller.ts |

---

## Martwy kod / Nadmierne testy

Brak - nie ma testów.

**Potencjalne problemy do monitorowania:**
1. `document.service.ts` - metoda `processDocument()` jest async bez await (fire-and-forget). To ryzykowne - w production powinien być queue.
2. Interfaces w `domain/` nie wymagają testów - są to kontrakty (ports w Clean Architecture).

---

## Rekomendowany plan działania

### Etap 1: CRITICAL (przed merge'em) - 1-2 dni

1. **Auth Service Tests** (auth.service.spec.ts)
   - register: success, email conflict
   - login: success, invalid credentials
   - validateUser: success, user not found
   - Mock: PrismaService, JwtService

2. **Workspace Service Tests** (workspace.service.spec.ts)
   - ensureMember: success, forbidden
   - ensureOwner: success, forbidden
   - removeMember: success, cannot remove self
   - Mock: PrismaService

3. **Document Service Tests** (document.service.spec.ts)
   - create: text document, file upload
   - ensureTags: normalizacja
   - File size validation (> 10MB)
   - Mock: PrismaService, WorkspaceService, StorageService (stub)

### Etap 2: HIGH - 2-3 dni

4. **Chunking Service Tests** (chunking.service.spec.ts)
   - chunk: small/medium/large documents
   - parseFile: PDF, DOCX, TXT, MD
   - fixedSizeChunk: overlap, boundaries
   - Mock: LLMService (stub dla różnych strategii)

5. **Search Service Tests** (search.service.spec.ts)
   - Integration test z testową bazą + pgvector
   - Semantic search
   - Tag filtering
   - Verification status filtering
   - Mock: EmbeddingsService (stub z fake embeddings)

6. **Public Link Service Tests** (public-link.service.spec.ts)
   - validateToken: valid, expired, inactive
   - searchPublic: tag scoping
   - Mock: PrismaService, EmbeddingsService

### Etap 3: MEDIUM - 1-2 dni

7. **Infrastructure Tests**
   - openai-embeddings.service.spec.ts (mock OpenAI client)
   - openai-llm.service.spec.ts (mock OpenAI client)
   - backblaze.service.spec.ts (mock S3 client)

8. **DTO Validation Tests**
   - Testy dla class-validator w każdym DTO

### Etap 4: E2E (przyszłość)

9. **End-to-End Tests**
   - Full flow: register → create workspace → upload document → search
   - Public API flow: create link → search via token
   - Setup: docker-compose z test database

---

## Przykład testu zgodnego z CLAUDE.md

### auth.service.spec.ts (stub approach, testowanie zachowania)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  // Stub dla PrismaService (nie mockujemy agregatów)
  const prismaStub = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const jwtStub = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: JwtService, useValue: jwtStub },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('register', () => {
    it('should register new user and return access token', async () => {
      // Arrange
      const dto = { email: 'test@example.com', password: 'password123', name: 'Test' };

      prismaStub.user.findUnique.mockResolvedValue(null); // User nie istnieje
      prismaStub.user.create.mockResolvedValue({
        id: 'user-id',
        email: dto.email,
        passwordHash: 'hashed',
        name: dto.name,
      });
      jwtStub.sign.mockReturnValue('jwt-token');

      // Act
      const result = await service.register(dto);

      // Assert - sprawdzamy ZACHOWANIE
      expect(result.accessToken).toBe('jwt-token');
      expect(result.user.email).toBe(dto.email);
      expect(prismaStub.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: dto.email,
          }),
        }),
      );

      // Sprawdź czy hasło zostało zahashowane
      const createCall = prismaStub.user.create.mock.calls[0][0];
      const isHashed = await bcrypt.compare(dto.password, createCall.data.passwordHash);
      expect(isHashed).toBe(true);
    });

    it('should throw ConflictException when email already exists', async () => {
      // Arrange
      const dto = { email: 'existing@example.com', password: 'password123' };
      prismaStub.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      // Act & Assert
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return access token for valid credentials', async () => {
      // Arrange
      const dto = { email: 'test@example.com', password: 'password123' };
      const passwordHash = await bcrypt.hash(dto.password, 10);

      prismaStub.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: dto.email,
        passwordHash,
        name: 'Test',
      });
      jwtStub.sign.mockReturnValue('jwt-token');

      // Act
      const result = await service.login(dto);

      // Assert
      expect(result.accessToken).toBe('jwt-token');
      expect(result.user.email).toBe(dto.email);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      // Arrange
      const dto = { email: 'test@example.com', password: 'wrong-password' };
      const passwordHash = await bcrypt.hash('correct-password', 10);

      prismaStub.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: dto.email,
        passwordHash,
      });

      // Act & Assert
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

**Kluczowe cechy przykładu:**
- Używamy stubs zamiast mocków (nie mockujemy agregatów)
- Testujemy ZACHOWANIE (czy zwraca token, czy rzuca wyjątek)
- NIE testujemy implementacji (np. ile razy wywołano bcrypt.hash)
- Arrange-Act-Assert pattern
- Każdy test ma jasny cel

---

## Podsumowanie

Projekt Knowledge Forge MVP ma:
- Świetną architekturę (Clean Architecture, DDD, porty-adaptery)
- Kompletne funkcjonalności (auth, workspace, documents, chunking, search, public links)
- Prawidłową konfigurację infrastruktury testowej

Ale:
- **0% code coverage**
- **Narusza podstawową zasadę TDD z CLAUDE.md**
- **Nie spełnia wymagań Fazy 1 ze specyfikacji**
- **Wysokie ryzyko regresji przy zmianach**
- **Ryzyko bezpieczeństwa (brak testów autoryzacji)**

### Rekomendacja: ZATRZYMAĆ MERGE

Przed merge'em należy dodać co najmniej:
1. Testy dla AuthService (bezpieczeństwo)
2. Testy dla WorkspaceService (autoryzacja)
3. Testy dla DocumentService (kluczowy flow)
4. Podstawowe testy dla ChunkingService

**Minimalne pokrycie do merge: 60% dla kluczowych serwisów (auth, workspace, document)**

Po merge'u:
- Uzupełnić pozostałe testy (search, public-link, infrastructure)
- Dodać E2E tests
- Włączyć coverage threshold w CI/CD

---

**Raport wygenerowany przez:** Test Reviewer Agent
**Data:** 2025-12-24 14:00
**Następny review:** Po dodaniu testów
