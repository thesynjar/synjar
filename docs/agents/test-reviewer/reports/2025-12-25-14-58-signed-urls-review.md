# Test Review Report - 2025-12-25

## Test Review Results

### Test Execution

- Tests przeszly: 95/119
- Tests nie przeszly: 24/119
- Przyczyna: Brakujacy mock dla `WorkspaceLimitsService` w `document.service.spec.ts` (niezwiazane z obecnymi zmianami)
- Przyczyna: Auth service testy wymagaja aktualizacji do nowego JWT payload (niezwiazane z obecnymi zmianami)
- Coverage: NIE ZMIERZONO (testy nieprzechodzace)

### Kontekst

- Sprawdzone moduly: `public-link`, `document`
- Zmienione pliki:
  - `apps/api/src/application/public-link/public-link.service.ts` - dodano signed URLs dla plikow PDF
  - `apps/api/src/application/public-link/public-link.module.ts` - dodano `StorageModule`
  - `apps/api/src/application/document/document.service.ts` - refaktoryzacja RLS context (niezwiazana zmiana)

- Powiazane przeplowy z ecosystem.md:
  - Public API Flow (RLS Bypass) - `validateToken()` -> `withoutRls()` -> `forUser(ownerId)` -> `getSignedFileUrl()`
  - Security Best Practices - validate THEN bypass

### CRITICAL (blokuje merge)

#### 1. Brak testow dla nowej funkcjonalnosci `getSignedFileUrl`

**Problem**: Nowa metoda `getSignedFileUrl()` nie ma testow jednostkowych ani integracyjnych.

**Gdzie uzywana**:
- `public-link.service.ts:224` - w `getPublicDocuments()`
- `public-link.service.ts:355` - w `searchPublic()`

**Kod**:
```typescript
private async getSignedFileUrl(fileUrl: string | null): Promise<string | null> {
  if (!fileUrl) return null;
  const key = fileUrl.split('/').pop();
  if (!key) return null;
  return this.storageService.getSignedUrl(key);
}
```

**Co przetestowac**:
- zwraca `null` gdy `fileUrl` jest `null`
- zwraca `null` gdy `fileUrl` nie zawiera klucza (np. `''`, `'/'`)
- wywoluje `storageService.getSignedUrl(key)` z poprawnym kluczem
- zwraca podpisany URL z `storageService`

**Przyklad testu**:
```typescript
describe('getSignedFileUrl', () => {
  it('should return null for null fileUrl', async () => {
    const result = await service['getSignedFileUrl'](null);
    expect(result).toBeNull();
  });

  it('should return null for fileUrl without key', async () => {
    const result = await service['getSignedFileUrl']('/');
    expect(result).toBeNull();
  });

  it('should generate signed URL for valid fileUrl', async () => {
    storageServiceStub.getSignedUrl = jest.fn().mockResolvedValue('https://signed.url');

    const result = await service['getSignedFileUrl']('https://storage.example.com/files/test.pdf');

    expect(storageServiceStub.getSignedUrl).toHaveBeenCalledWith('test.pdf');
    expect(result).toBe('https://signed.url');
  });
});
```

#### 2. Brak testow dla `getPublicDocuments` z signed URLs

**Problem**: Metoda `getPublicDocuments()` zwraca signed URLs, ale nie ma testow weryfikujacych to zachowanie.

**Co przetestowac**:
- dokumenty z `fileUrl` zwracaja signed URL
- dokumenty bez `fileUrl` zwracaja `null`
- signed URLs sa generowane dla kazdego dokumentu (wielokrotne wywolania `getSignedFileUrl`)

**Przyklad testu**:
```typescript
it('should return documents with signed URLs', async () => {
  const token = 'valid-token';
  const link = {
    workspaceId: 'workspace-123',
    workspace: { name: 'Test', createdById: 'owner-123' },
    allowedTags: [],
  };

  validateTokenStub.mockResolvedValue(link);
  storageServiceStub.getSignedUrl = jest.fn().mockResolvedValue('https://signed.url/file.pdf');

  // Mock prisma.forUser to return documents
  prismaStub.forUser = jest.fn().mockImplementation((_userId, callback) => {
    const mockTx = {
      document: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'doc-1', title: 'Test', fileUrl: 'https://storage/file.pdf', tags: [] },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    return callback(mockTx);
  });

  const result = await service.getPublicDocuments(token, {});

  expect(result.documents[0].fileUrl).toBe('https://signed.url/file.pdf');
  expect(storageServiceStub.getSignedUrl).toHaveBeenCalledWith('file.pdf');
});
```

#### 3. Brak testow dla `searchPublic` z signed URLs

**Problem**: Metoda `searchPublic()` zwraca signed URLs w wynikach wyszukiwania, ale nie ma testow weryfikujacych to zachowanie.

**Co przetestowac**:
- wyniki wyszukiwania z `file_url` zwracaja signed URL
- wyniki wyszukiwania bez `file_url` zwracaja `null`
- signed URLs sa generowane dla kazdego wyniku

#### 4. Brak testow integracyjnych dla full flow

**Problem**: Brak testow E2E weryfikujacych caly przepływ:
1. Utworz public link
2. Wykonaj public search przez token
3. Zweryfikuj ze zwrocone `fileUrl` to signed URLs (nie raw storage URLs)

### HIGH (powinno byc naprawione)

#### 5. Brak testow dla RLS context w public API

**Problem**: Zmiany w `public-link.service.ts` wprowadzaja `forUser(ownerId)` dla RLS context, ale nie ma testow weryfikujacych:
- `validateToken()` uzywa `withoutRls()` (system operation)
- `getPublicDocuments()` uzywa `forUser(ownerId)` (workspace owner context)
- `searchPublic()` uzywa `forUser(ownerId)` (workspace owner context)

**Zgodnosc z ecosystem.md**:
> Pattern 3: Public API (with validation)
> ```typescript
> async search(token: string, query: string) {
>   // 1. Validate token FIRST
>   const publicLink = await this.validatePublicLink(token);
>
>   // 2. Then bypass RLS with filters
>   return this.prisma.withoutRls(async (tx) => {
>     const results = await tx.chunk.findMany({
>       where: {
>         document: {
>           workspaceId: publicLink.workspaceId, // Filter by validated workspace
>         }
>       }
>     });
>     return results;
>   });
> }
> ```

**Obecna implementacja**: Implementacja jest LEPSZA niz w ecosystem.md - uzywa `forUser(ownerId)` zamiast `withoutRls()`, co jest bezpieczniejsze (RLS jest aktywny dla workspace ownera).

**Co przetestowac**:
- `validateToken()` wywoluje `prisma.withoutRls()` (bo to system operation)
- `getPublicDocuments()` wywoluje `prisma.forUser(ownerId)` gdzie `ownerId` = `link.workspace.createdById`
- `searchPublic()` wywoluje `prisma.forUser(ownerId)` gdzie `ownerId` = `link.workspace.createdById`

#### 6. Brak plikow testowych dla `public-link.service.ts`

**Problem**: Moduł `public-link` nie ma ZADNYCH testow:
- Brak `public-link.service.spec.ts`
- Brak testow integracyjnych w `test/` directory
- Brak testow E2E dla public endpoints

**Zakres testow do napisania**:

| Typ testu | Plik | Co przetestowac |
|-----------|------|-----------------|
| Unit | `public-link.service.spec.ts` | Wszystkie metody service (create, findAll, findOne, delete, validateToken, getPublicDocuments, searchPublic, getSignedFileUrl) |
| Integration | `test/public-link.integration.spec.ts` | RLS enforcement, token validation, workspace isolation |
| E2E | `test/public-api-e2e.spec.ts` | Full HTTP flow: POST /public-links, GET /public/search/:token |

#### 7. Niezwiazane zmiany w `document.service.ts` wprowadzaja regresje

**Problem**: Plik `document.service.ts` zostal zmieniony (refaktoryzacja RLS), ale testy nie przechodzą z powodu brakujacej zaleznosci `WorkspaceLimitsService`.

**Impact**: Wszystkie 22 testy w `document.service.spec.ts` failuja z:
```
Nest can't resolve dependencies of the DocumentService (..., WorkspaceLimitsService, ...)
```

**Root cause**: DocumentService dodal nowa zaleznosc `WorkspaceLimitsService` (linia 19), ale `document.service.spec.ts` nie zostal zaktualizowany o mock dla tej zaleznosci.

**Fix**:
```typescript
// W document.service.spec.ts
let workspaceLimitsServiceStub: Partial<WorkspaceLimitsService>;

beforeEach(async () => {
  workspaceLimitsServiceStub = {
    checkDocumentLimit: jest.fn().mockResolvedValue(undefined),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DocumentService,
      { provide: PrismaService, useValue: prismaStub },
      { provide: WorkspaceService, useValue: workspaceServiceStub },
      { provide: ChunkingService, useValue: chunkingServiceStub },
      { provide: WorkspaceLimitsService, useValue: workspaceLimitsServiceStub }, // ADD THIS
      { provide: EMBEDDINGS_SERVICE, useValue: embeddingsServiceStub },
      { provide: STORAGE_SERVICE, useValue: storageServiceStub },
      { provide: DOCUMENT_REPOSITORY, useValue: documentRepositoryStub },
    ],
  }).compile();
});
```

### MEDIUM (do poprawy)

#### 8. Brak testow dla edge cases w `getSignedFileUrl`

**Edge cases do przetestowania**:
- `fileUrl` z wieloma `/` (np. `'https://example.com/a/b/c/file.pdf'`) - powinien zwrocic `'file.pdf'`
- `fileUrl` bez `/` (np. `'file.pdf'`) - powinien zwrocic `'file.pdf'`
- `fileUrl` z pustym kluczem (np. `'https://example.com/'`) - powinien zwrocic `null`
- `storageService.getSignedUrl()` rzuca bład - jak obsluzyc? (obecnie brak obslugi bledow)

#### 9. Brak testow dla tag filtering w public API

**Problem**: `getPublicDocuments()` i `searchPublic()` filtruja dokumenty po tagach (intersection of `link.allowedTags` and `dto.tags`), ale nie ma testow weryfikujacych:
- gdy `link.allowedTags` jest puste - zwraca wszystkie dokumenty
- gdy `link.allowedTags` = `['tag-a']` i `dto.tags` = `['tag-b']` - zwraca pusta liste
- gdy `link.allowedTags` = `['tag-a']` i `dto.tags` = `['tag-a']` - zwraca dokumenty z `tag-a`

#### 10. Brak testow dla expiry validation

**Problem**: `validateToken()` sprawdza czy link wygasl (`expiresAt < new Date()`), ale nie ma testow weryfikujacych:
- gdy `expiresAt` jest `null` - link jest valid
- gdy `expiresAt` jest w przyszlosci - link jest valid
- gdy `expiresAt` jest w przeszlosci - rzuca `ForbiddenException('Link has expired')`

### LOW (sugestia)

#### 11. Brak testow dla performance (N+1 queries)

**Sugestia**: Dodaj testy integracyjne weryfikujace liczbe query do bazy danych:
- `getPublicDocuments()` z 10 dokumentami nie powinno wykonac wiecej niz 3 queries (findMany, count, getSignedUrl * 10)
- `searchPublic()` z 10 wynikami nie powinno wykonac wiecej niz 3 queries ($queryRaw, documentTag.findMany, getSignedUrl * 10)

#### 12. Brak testow dla concurrent requests

**Sugestia**: Dodaj testy weryfikujace ze AsyncLocalStorage dziala poprawnie dla concurrent public API requests:
- 2 rownolegle requesty z roznymi tokenami nie mieszaja RLS context
- User A przez public link workspace-1 nie widzi dokumentow z workspace-2

### Dobre praktyki

#### 1. Zgodnosc z ecosystem.md Security Best Practices

**GOOD**: `validateToken()` najpierw waliduje token, POTEM uzywa `withoutRls()`:
```typescript
async validateToken(token: string): Promise<...> {
  // Use withoutRls to bypass RLS for public token validation (system operation)
  const results = await this.prisma.withoutRls(async (tx) => {
    return tx.publicLink.findFirst({ where: { token } });
  });

  if (!results) throw new NotFoundException('Invalid token');
  if (!results.isActive) throw new ForbiddenException('Link is inactive');
  if (results.expiresAt && results.expiresAt < new Date()) {
    throw new ForbiddenException('Link has expired');
  }

  return results;
}
```

Zgodne z ecosystem.md:
> ### 2. Public API: validate THEN bypass

#### 2. Uzycie `forUser(ownerId)` zamiast `withoutRls()` dla public search

**GOOD**: `getPublicDocuments()` i `searchPublic()` uzywaja `forUser(ownerId)` zamiast `withoutRls()`, co jest bezpieczniejsze:
```typescript
const link = await this.validateToken(token);
const ownerId = link.workspace.createdById;

// Use workspace owner as RLS context for public access
return this.prisma.forUser(ownerId, async (tx) => {
  const documents = await tx.document.findMany({ ... });
  return documents;
});
```

To zapewnia ze:
- RLS policies sa aktywne (workspace owner widzi tylko swoje workspace)
- Nawet jesli walidacja tokena ma bug, user nie zobaczy obcych workspace'ow

#### 3. Dependency Injection dla `STORAGE_SERVICE`

**GOOD**: Uzycie DI token `STORAGE_SERVICE` zamiast konkretnej implementacji:
```typescript
@Inject(STORAGE_SERVICE)
private readonly storageService: IStorageService,
```

To pozwala na latwe mockowanie w testach i zmiane implementacji (np. z Backblaze B2 na AWS S3) bez modyfikacji service.

#### 4. Async URL generation dla kazdego dokumentu

**GOOD**: Uzycie `Promise.all()` dla rownoleglego generowania signed URLs:
```typescript
const documentsWithSignedUrls = await Promise.all(
  documents.map(async (doc) => ({
    ...doc,
    fileUrl: await this.getSignedFileUrl(doc.fileUrl),
  })),
);
```

To jest wydajne (signed URLs sa generowane rownolegle, nie sekwencyjnie).

#### 5. Wydzielenie `getSignedFileUrl` jako private method

**GOOD**: Logika generowania signed URL jest wydzielona do osobnej metody, co:
- Redukuje duplikacje (uzywana w `getPublicDocuments` i `searchPublic`)
- Latwiejsza do przetestowania (mozna testowac w izolacji)
- Latwiejsza do zmiany (np. dodanie cache dla signed URLs)

### Brakujace testy (TYLKO dla uzywanego kodu)

| Plik | Typ testu | Co przetestowac | Gdzie uzywane |
|------|-----------|-----------------|---------------|
| `public-link.service.ts` | Unit | `getSignedFileUrl()` - edge cases (null, empty, valid) | `getPublicDocuments:224`, `searchPublic:355` |
| `public-link.service.ts` | Unit | `getPublicDocuments()` - signed URLs generation | `PublicController.getDocuments()` |
| `public-link.service.ts` | Unit | `searchPublic()` - signed URLs generation | `PublicController.search()` |
| `public-link.service.ts` | Unit | `validateToken()` - expiry validation | `getPublicDocuments:169`, `searchPublic:262` |
| `public-link.service.ts` | Unit | Tag filtering (allowedTags intersection) | `getPublicDocuments`, `searchPublic` |
| `public-link.service.ts` | Integration | RLS context (`forUser(ownerId)`) | All public methods |
| `public-link.service.ts` | Integration | Token validation flow (validate -> bypass -> filter) | All public methods |
| `public-link.service.ts` | E2E | Full HTTP flow (POST /public-links, GET /public/search/:token) | Public API endpoints |

### Martwy kod / Nadmierne testy

**Brak martwego kodu** - wszystkie metody w `public-link.service.ts` sa uzywane przez `PublicController`.

### Rekomendacje

#### Priorytet 1 (blokuje merge)
1. Napraw testy `document.service.spec.ts` - dodaj mock dla `WorkspaceLimitsService`
2. Stworz `public-link.service.spec.ts` z testami dla:
   - `getSignedFileUrl()` (unit tests)
   - `getPublicDocuments()` (unit tests z mock dla signed URLs)
   - `searchPublic()` (unit tests z mock dla signed URLs)

#### Priorytet 2 (przed deploy do production)
3. Dodaj testy integracyjne dla RLS context w public API
4. Dodaj testy E2E dla full flow (create public link -> search -> verify signed URLs)
5. Dodaj testy dla edge cases (expiry, tag filtering, null fileUrl)

#### Priorytet 3 (post-merge)
6. Dodaj testy performance (N+1 queries)
7. Dodaj testy dla concurrent requests (AsyncLocalStorage isolation)

### Podsumowanie

**Status**: CRITICAL - merge ZABLOKOWANY

**Przyczyny**:
1. Brak testow dla nowej funkcjonalnosci `getSignedFileUrl`
2. Brak testow dla `getPublicDocuments` i `searchPublic` z signed URLs
3. Regresja w `document.service.spec.ts` (brakujacy mock dla `WorkspaceLimitsService`)

**Czas na naprawe**: ~2-3 godziny
- 30 min: napraw `document.service.spec.ts`
- 60 min: stworz `public-link.service.spec.ts` z podstawowymi testami
- 60 min: dodaj testy integracyjne dla RLS context

**Zalecenia**:
1. Przywroc przechodzace testy (`document.service.spec.ts`)
2. Dodaj testy jednostkowe dla `getSignedFileUrl`
3. Dodaj testy jednostkowe dla `getPublicDocuments` i `searchPublic` weryfikujace signed URLs
4. Rozważ dodanie testow integracyjnych dla RLS context (zgodnie z ecosystem.md)

---

**Ostatnia aktualizacja**: 2025-12-25 14:58
**Reviewer**: Test Reviewer Agent
**Context**: Signed URLs implementation dla public API
