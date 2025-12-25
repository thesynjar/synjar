# Code Quality Review Report - 2025-12-24

## Build Status

- Build: PASS (NestJS build completed successfully)
- TypeScript: PASS (no compilation errors)
- Lint: FAILED (ESLint config missing - eslint.config.js not found)

## Kontekst

Przegląd MVP projektu Knowledge Forge - początkowy commit całego systemu.

**Sprawdzone moduły:**
- Auth (register, login, JWT)
- Workspace (CRUD + members)
- Document (upload, processing, chunking)
- Search (RAG with pgvector)
- Public Links (token-based access)
- Infrastructure (Prisma, OpenAI, Backblaze B2)

**Zgodność z domeną:**
Projekt nie posiada `docs/ecosystem.md`, więc weryfikacja nazewnictwa odbywa się w kontekście specyfikacji `docs/specifications/2025-12-24-knowledge-forge.md`. Nazewnictwo jest spójne z DDD i Clean Architecture.

---

## CRITICAL (blokuje merge)

### 1. SECURITY: SQL Injection Risk w RAW Queries

**Plik:** `apps/api/src/application/search/search.service.ts:72-99`
**Plik:** `apps/api/src/application/public-link/public-link.service.ts:208-233`

**Problem:**
Używanie `$queryRawUnsafe` z interpolacją stringów bezpośrednio w zapytaniu SQL naraża na SQL injection.

```typescript
// UNSAFE - workspaceId i embedding są interpolowane bezpośrednio
const results = await this.prisma.$queryRawUnsafe<...>(`
  SELECT ...
  WHERE d."workspaceId" = '${workspaceId}'
  ...
  ORDER BY c.embedding <=> '${JSON.stringify(embedding)}'::vector
  LIMIT ${limit}
`);
```

Dodatkowo w `search.service.ts:58`:
```typescript
const tagList = dto.tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
tagFilter = `AND d.id IN (... WHERE t.name IN (${tagList}))`;
```

Choć jest escape pojedynczych cudzysłowów, lepiej użyć parametryzowanych zapytań.

**Rozwiązanie:**
Użyj `$queryRaw` z tagged template lub Prisma parametrized queries:

```typescript
const results = await this.prisma.$queryRaw`
  SELECT
    c.id as chunk_id,
    d.id as document_id,
    c.content as chunk_content,
    1 - (c.embedding <=> ${JSON.stringify(embedding)}::vector) as score,
    d.title,
    d."fileUrl" as file_url,
    d."verificationStatus" as verification_status
  FROM "Chunk" c
  JOIN "Document" d ON d.id = c."documentId"
  WHERE d."workspaceId" = ${workspaceId}::uuid
    AND d."processingStatus" = 'COMPLETED'
  ORDER BY c.embedding <=> ${JSON.stringify(embedding)}::vector
  LIMIT ${limit}
`;
```

### 2. MISSING: ESLint Configuration

**Problem:**
Brak pliku `eslint.config.js` lub `.eslintrc.*` powoduje, że lint nie działa.

```bash
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

**Rozwiązanie:**
Dodaj `eslint.config.js` lub `.eslintrc.json` z konfiguracją dla TypeScript:

```javascript
// eslint.config.js
import tsEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsEslint,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
];
```

### 3. MISSING: Tests

**Problem:**
Projekt nie zawiera żadnych testów jednostkowych ani E2E (0 plików `*.spec.ts` / `*.test.ts`).

Zgodnie z `CLAUDE.md`:
> 3. Zawsze pisz testy najpierw (TDD). Stub > mock. Nie testuj implementacji, testuj zachowanie.

**Rozwiązanie:**
Dodaj testy dla kluczowych serwisów:
- `auth.service.spec.ts`
- `workspace.service.spec.ts`
- `document.service.spec.ts`
- `chunking.service.spec.ts`
- `search.service.spec.ts`

---

## HIGH (powinno być naprawione)

### 1. TypeScript: 'any' Type Usage

**Lokalizacje:**
- `apps/api/src/application/document/document.service.ts:139` - `const where: any = { workspaceId };`
- `apps/api/src/application/public-link/public-link.service.ts:129` - `const where: any = { ... }`
- `apps/api/src/types/pdf-parse.d.ts:16` - `_metadata?: any;`

**Problem:**
Użycie `any` omija type safety TypeScript.

**Rozwiązanie:**
Zdefiniuj odpowiednie typy:

```typescript
// document.service.ts:139
import { Prisma } from '@prisma/client';

const where: Prisma.DocumentWhereInput = { workspaceId };
```

### 2. TypeScript: Strict Mode nie jest w pełni włączony

**Plik:** `apps/api/tsconfig.json`

**Problem:**
Brak pełnego `strict: true`. Mamy tylko częściowe strict checks:
- `strictNullChecks: true`
- `noImplicitAny: true`
- `strictBindCallApply: true`

Brakuje:
- `strictFunctionTypes`
- `strictPropertyInitialization`
- `noImplicitThis`
- `alwaysStrict`

**Rozwiązanie:**
```json
{
  "compilerOptions": {
    "strict": true,
    // ... reszta konfiguracji
  }
}
```

### 3. Error Handling: Console.error w Background Processing

**Plik:** `apps/api/src/application/document/document.service.ts:127,256,277`

**Problem:**
Asynchroniczne przetwarzanie używa `.catch(console.error)` co połyka błędy:

```typescript
this.processDocument(document.id).catch(console.error);
```

**Rozwiązanie:**
Użyj loggera (np. NestJS Logger) i/lub kolejki z retry mechanism:

```typescript
private readonly logger = new Logger(DocumentService.name);

this.processDocument(document.id).catch((error) => {
  this.logger.error(`Failed to process document ${document.id}`, error.stack);
  // Opcjonalnie: wyślij do kolejki retry lub monitoring
});
```

### 4. Magic Numbers/Constants

**Lokalizacje:**
- `document.service.ts:24` - `MAX_FILE_SIZE = 10 * 1024 * 1024`
- `document.controller.ts:40` - duplikacja `MAX_FILE_SIZE`
- `chunking.service.ts:9,10,12,13` - thresholdy tokenów

**Problem:**
Duplikacja konstant i brak centralizacji konfiguracji.

**Rozwiązanie:**
Przenieś do pliku konfiguracyjnego:

```typescript
// src/config/constants.ts
export const FILE_CONSTRAINTS = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ],
} as const;

export const CHUNKING_THRESHOLDS = {
  SMALL_DOC: 1000,
  MEDIUM_DOC: 10000,
  CHUNK_SIZE: 512,
  CHUNK_OVERLAP: 64,
} as const;
```

---

## MEDIUM (do poprawy)

### 1. Długie Funkcje

**Plik:** `apps/api/src/application/document/document.service.ts:286-346`

**Problem:**
Metoda `processDocument` ma 60 linii - przekracza zalecane 50 linii.

**Rozwiązanie:**
Rozdziel na mniejsze funkcje:

```typescript
private async processDocument(documentId: string) {
  try {
    await this.markAsProcessing(documentId);
    const document = await this.getDocument(documentId);
    if (!document) return;

    await this.clearExistingChunks(documentId);
    const chunks = await this.generateChunks(document.content);
    await this.storeChunksWithEmbeddings(documentId, chunks);
    await this.markAsCompleted(documentId);
  } catch (error) {
    await this.markAsFailed(documentId, error);
  }
}

private async storeChunksWithEmbeddings(documentId: string, chunks: ChunkResult[]) {
  const embeddings = await this.embeddingsService.generateEmbeddings(
    chunks.map((c) => c.content),
  );

  for (let i = 0; i < chunks.length; i++) {
    await this.storeChunk(documentId, chunks[i], embeddings[i], i);
  }
}
```

### 2. Długie Pliki

**Plik:** `apps/api/src/application/document/document.service.ts` - 365 linii

**Status:** ⚠️ Blisko limitu (300 linii)

**Sugestia:**
Rozważ podział na:
- `document.service.ts` - główne CRUD
- `document-processing.service.ts` - chunking i embeddings
- `document-query.service.ts` - zaawansowane queries

### 3. Deep Nesting w Chunking

**Plik:** `apps/api/src/application/chunking/chunking.service.ts:104-150`

**Problem:**
Metoda `splitByStructure` ma 3-4 poziomy zagnieżdżenia.

**Rozwiązanie:**
Early return pattern:

```typescript
private splitByStructure(text: string): Array<{ content: string; type: string }> {
  const headerRegex = /^(#{1,3})\s+(.+)$/gm;
  const matches = [...text.matchAll(headerRegex)];

  if (matches.length <= 1) {
    return this.splitByParagraphs(text);
  }

  return this.splitByHeaders(text, matches);
}

private splitByParagraphs(text: string): Array<{ content: string; type: string }> {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length > 1) {
    return paragraphs.map((p) => ({ content: p.trim(), type: 'paragraph' }));
  }
  return [{ content: text, type: 'document' }];
}
```

### 4. Brak Explicit Return Types

**Problem:**
Większość funkcji nie ma zadeklarowanych typów zwracanych.

**Przykład:**
```typescript
async create(workspaceId: string, userId: string, dto: CreateDocumentDto, file?: Express.Multer.File) {
  // ... brak Promise<DocumentType>
}
```

**Rozwiązanie:**
```typescript
async create(
  workspaceId: string,
  userId: string,
  dto: CreateDocumentDto,
  file?: Express.Multer.File,
): Promise<Document & { tags: DocumentTag[] }> {
  // ...
}
```

### 5. DTOs w Serwisach zamiast w DTO Layer

**Lokalizacje:**
- `apps/api/src/application/document/document.service.ts:26-49`
- `apps/api/src/application/workspace/workspace.service.ts:9-20`
- `apps/api/src/application/auth/auth.service.ts:10-28`

**Problem:**
Duplikacja DTOs - są już w `interfaces/dto/*.dto.ts` ale także definiowane lokalnie w serwisach.

**Rozwiązanie:**
Importuj DTOs z warstwy interfaces:

```typescript
import { CreateDocumentDto, UpdateDocumentDto } from '@/interfaces/dto/document.dto';
```

---

## LOW (sugestia)

### 1. Console.log w Production Code

**Plik:** `apps/api/src/main.ts:34-35`

```typescript
console.log(`Application is running on: http://localhost:${port}`);
console.log(`Swagger docs: http://localhost:${port}/api/docs`);
```

**Sugestia:**
Użyj NestJS Logger:

```typescript
const logger = new Logger('Bootstrap');
logger.log(`Application is running on: http://localhost:${port}`);
logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
```

### 2. Hardcoded Region w Backblaze Service

**Plik:** `apps/api/src/infrastructure/storage/backblaze.service.ts:25`

```typescript
region: 'eu-central-003',
```

**Sugestia:**
Przenieś do zmiennej środowiskowej:

```typescript
region: this.configService.get('B2_REGION', 'eu-central-003'),
```

### 3. CORS włączony bez konfiguracji

**Plik:** `apps/api/src/main.ts:19`

```typescript
app.enableCors();
```

**Sugestia:**
Dodaj konfigurację dla produkcji:

```typescript
app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
});
```

### 4. Brak Rate Limiting dla Public API

**Problem:**
Public endpoints (`/public/:token/search`) nie mają rate limiting, co może prowadzić do abuse.

**Sugestia:**
Dodaj `@nestjs/throttler`:

```typescript
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Controller('public/:token')
export class PublicController { ... }
```

### 5. Nieoptymalne N+1 Query w Document Tags

**Plik:** `apps/api/src/application/search/search.service.ts:102-113`

**Problem:**
Po pobraniu chunks, osobne zapytanie do `documentTags` - potencjalny N+1.

**Sugestia:**
Rozważ JOIN w głównym query lub użyj Prisma `include`.

---

## Dobre praktyki

### 1. Clean Architecture

Projekt konsekwentnie stosuje Clean Architecture:
- `domain/` - porty (interfaces)
- `application/` - use cases, serwisy biznesowe
- `infrastructure/` - implementacje (Prisma, OpenAI, B2)
- `interfaces/` - kontrolery, DTOs

### 2. Dependency Injection

Wszystkie zależności są wstrzykiwane przez konstruktor, nie ma `new`.

### 3. Validation

Użycie `class-validator` i `class-transformer` w DTOs zapewnia type-safe validation.

### 4. Swagger/OpenAPI

Wszystkie endpointy mają dekoratory `@ApiOperation`, `@ApiResponse`, `@ApiTags` - dobra dokumentacja API.

### 5. Error Handling

Używanie NestJS exceptions (`NotFoundException`, `ForbiddenException`, `BadRequestException`) zamiast custom error codes.

### 6. Naming Conventions

- Services: `*Service` (PascalCase)
- Controllers: `*Controller`
- DTOs: `*Dto`
- Interfaces (ports): `I*Service`
- Zmienne: camelCase
- Klasy: PascalCase

### 7. Separation of Concerns

Każdy serwis ma jedną odpowiedzialność:
- `AuthService` - autentykacja
- `WorkspaceService` - zarządzanie workspace
- `DocumentService` - CRUD dokumentów
- `ChunkingService` - parsowanie i chunking
- `SearchService` - RAG search

### 8. Authorization Guards

Konsekwentne użycie `@UseGuards(JwtAuthGuard)` i `ensureMember()`/`ensureOwner()` do sprawdzania uprawnień.

### 9. Prisma Best Practices

- Używanie `include` zamiast N+1 queries (w większości miejsc)
- Transakcje gdzie potrzebne
- Indexes w schema.prisma

---

## Metryki

| Metryka                | Wartość  | Status |
| ---------------------- | -------- | ------ |
| Największy plik        | 365 linii | ⚠️ (document.service.ts) |
| Najdłuższa funkcja     | ~60 linii | ⚠️ (processDocument) |
| Użycie `any`           | 3 miejsca | ⚠️     |
| TODO/FIXME             | 0        | OK     |
| console.log/error/warn | 7        | ⚠️     |
| Pokrycie testami       | 0%       | CRITICAL |
| TypeScript strict      | Częściowe | HIGH   |
| SQL Injection Risk     | 2 miejsca | CRITICAL |

---

## Podsumowanie

### Ocena ogólna: 7/10

**Mocne strony:**
- Bardzo dobra architektura (Clean Architecture + DDD)
- Spójna struktura kodu
- Dobra separacja warstw
- Używanie dependency injection
- Swagger dokumentacja

**Krytyczne problemy:**
- Brak testów (0%)
- SQL injection risk w raw queries
- Brak ESLint konfiguracji

**Do naprawy przed production:**
1. Napraw SQL injection (używaj `$queryRaw` zamiast `$queryRawUnsafe`)
2. Dodaj testy jednostkowe (cel: >70% coverage)
3. Dodaj ESLint i napraw warnings
4. Włącz pełny TypeScript strict mode
5. Zastąp console.* przez Logger
6. Dodaj rate limiting dla public API

**Następne kroki:**
1. Zacznij od testów dla `auth.service.ts`, `workspace.service.ts`
2. Refaktoryzuj SQL queries na bezpieczne
3. Dodaj ESLint config
4. Włącz `strict: true` w tsconfig.json
5. Wprowadź centralizację konstant

---

**Raport wygenerowany:** 2025-12-24
**Sprawdzone przez:** Code Quality Reviewer Agent (Claude Opus 4.5)
