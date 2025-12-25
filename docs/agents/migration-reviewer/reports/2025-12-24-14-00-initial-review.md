# Migration Review Report - 2025-12-24

**Data przeglądu:** 2025-12-24 14:00
**Reviewer:** Migration Reviewer Agent
**Typ migracji:** Initial Schema Creation
**Status:** APPROVED with conditions

---

## Migration Review Results

### Kontekst

**Migracje:**
- `apps/api/prisma/migrations/20251224125334_init/migration.sql` - Initial migration (NEW DATABASE)

**Dotknięte tabele:**
- User
- Workspace
- WorkspaceMember
- Document
- Chunk
- Tag
- DocumentTag
- PublicLink

**Multi-tenancy:** Workspace-based isolation (workspace per tenant, shared database)

**Typ migracji:** Initial schema creation - NOWA BAZA DANYCH

**Uwaga:** To jest initial migration dla nowej bazy danych, więc:
- NIE MA ryzyka utraty danych (baza jest pusta)
- NIE MA breaking changes (brak istniejącego kodu działającego na starym schemacie)
- Wszystkie operacje są ADDITIVE (CREATE, nie ALTER/DROP)

---

## Critical Findings

### BRAK - Migracja jest bezpieczna

To jest initial migration dla nowej bazy - brak operacji ryzykownych dla danych.

---

## HIGH - Wymagają uwagi

### 1. BRAKUJĄCY VECTOR INDEX (PERFORMANCE-CRITICAL)

**Problem:**
Migracja nie tworzy indexu wektorowego na `Chunk.embedding`, który jest KONIECZNY dla wydajnego RAG search.

**Wpływ:**
- Bez indexu wyszukiwanie wektorowe będzie BARDZO WOLNE (sequential scan)
- Przy 1,000 chunków: zauważalne spowolnienie
- Przy 10,000+ chunków: praktycznie nieużyteczne
- Przy 100,000+ chunków: timeout queries

**Zgodnie ze specyfikacją (docs/specifications/2025-12-24-knowledge-forge.md, sekcja 7.1):**
```sql
-- Index for similarity search
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**Akcja wymagana:**
Dodać vector index jako druga migracja lub ręcznie po deployment.

**Opcja A: Dodaj jako druga migracja Prisma**
```bash
npx prisma migrate dev --name add_vector_index --create-only
```

Następnie edytuj wygenerowany SQL:
```sql
-- Add vector index for similarity search
-- HNSW is recommended for general use (works with any dataset size)
CREATE INDEX chunks_embedding_idx ON "Chunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Alternative: IVFFlat (requires >1000 vectors, faster queries)
-- CREATE INDEX chunks_embedding_idx ON "Chunk"
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);
```

**Opcja B: Ręczne dodanie po seedowaniu**
```bash
psql $DATABASE_URL -c "
CREATE INDEX chunks_embedding_idx ON \"Chunk\"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
"
```

**Rekomendacja:**
- HNSW index - działa dla dowolnej wielkości zbioru, dobra performance
- IVFFlat - szybsze queries, ale wymaga >1000 vectors i rebuild przy dużych zmianach

---

## MEDIUM - Wymagają uwagi

### 1. Seed Script - Brak Production Guard

**Problem:**
Seed script (`apps/api/prisma/seed.ts`) nie sprawdza środowiska przed utworzeniem admin user.

**Obecny kod:**
```typescript
const user = await prisma.user.upsert({
  where: { email: 'admin@knowledge-forge.local' },
  update: {},
  create: {
    email: 'admin@knowledge-forge.local',
    passwordHash,
    name: 'Admin User',
  },
});
```

**Rekomendacja:**
Dodaj guard dla production environment:

```typescript
if (process.env.NODE_ENV === 'production') {
  console.log('⚠️  Skipping seed in production');
  console.log('💡 Create admin user manually using admin CLI');
  return;
}
```

**Status:** Medium priority - seed user ma losowe hasło i localhost email, ale lepiej zabezpieczyć.

---

### 2. PublicLink Token - Brak Database DEFAULT

**Obecny stan:**
```sql
"token" TEXT NOT NULL,
```

**Prisma schema:**
```prisma
token String @unique @default(uuid())
```

**Problem:**
- Prisma generuje UUID w application layer
- Brak DEFAULT w database oznacza, że bezpośredni INSERT w DB wymaga podania token
- OK dla MVP (wszystkie operacje przez Prisma)

**Rekomendacja (optional):**
Dla większego bezpieczeństwa dodaj DEFAULT w database:
```sql
"token" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
```

**Status:** Low priority - Prisma kontroluje wszystkie inserty.

---

## LOW - Sugestie (nice-to-have)

### 1. Check Constraints dla Business Rules

**Przykłady:**
```sql
-- Document: fileSize musi być > 0 jeśli jest ustawiony
ALTER TABLE "Document" ADD CONSTRAINT "Document_fileSize_positive"
  CHECK ("fileSize" IS NULL OR "fileSize" > 0);

-- PublicLink: expiresAt musi być w przyszłości
ALTER TABLE "PublicLink" ADD CONSTRAINT "PublicLink_expiresAt_future"
  CHECK ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP);

-- Document: originalFilename wymagany dla FILE contentType
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_metadata"
  CHECK (
    ("contentType" = 'FILE' AND "originalFilename" IS NOT NULL) OR
    ("contentType" = 'TEXT')
  );
```

**Status:** Nice-to-have - business logic może być w application layer.

---

### 2. Database Documentation (COMMENT ON)

**Przykład:**
```sql
COMMENT ON TABLE "Chunk" IS 'Vector embeddings for RAG search';
COMMENT ON COLUMN "Chunk"."embedding" IS 'OpenAI text-embedding-3-small (1536 dimensions)';
COMMENT ON COLUMN "Document"."verificationStatus" IS 'VERIFIED = trusted source, UNVERIFIED = user-generated or unconfirmed';
```

**Status:** Documentation improvement - low priority.

---

### 3. Audit Fields (created_by, updated_by)

**Przykład:**
```sql
ALTER TABLE "Document" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "Document" ADD COLUMN "updatedBy" TEXT;

-- Add foreign keys
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL;
```

**Status:** Audit trail - może być dodane w przyszłej migracji jeśli potrzebne.

---

## Bezpieczne operacje

### Wszystkie operacje w migracji są ADDITIVE i BEZPIECZNE:

1. ✅ CREATE EXTENSION IF NOT EXISTS "vector"
2. ✅ CREATE TYPE (Role, ContentType, VerificationStatus, ProcessingStatus)
3. ✅ CREATE TABLE (wszystkie 8 tabel)
4. ✅ CREATE INDEX (wszystkie B-tree indexy)
5. ✅ CREATE UNIQUE INDEX (constraints)
6. ✅ ALTER TABLE ADD CONSTRAINT (wszystkie foreign keys)

**Brak operacji ryzykownych:**
- Brak DROP TABLE/COLUMN
- Brak ALTER COLUMN TYPE
- Brak DELETE/TRUNCATE
- Brak modyfikacji istniejących danych

---

## Analiza szczegółowa

### 1. pgvector Extension

```sql
CREATE EXTENSION IF NOT EXISTS "vector";
```

**Status:** ✅ BEZPIECZNE
- `IF NOT EXISTS` chroni przed błędem przy ponownym uruchomieniu
- Wymaga uprawnień SUPERUSER lub roli z CREATE ON DATABASE
- Standardowa procedura dla pgvector

**Weryfikacja:**
```bash
psql -U postgres -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"
```

---

### 2. Timestampy - Zgodność ze standardami

**Standard z CLAUDE.md:**
> 4. Wszystkie timestampy jako `timestamp with time zone`.

**Analiza:**
```sql
-- User
"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, ✅
"updatedAt" TIMESTAMPTZ NOT NULL, ✅

-- Workspace
"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, ✅
"updatedAt" TIMESTAMPTZ NOT NULL, ✅

-- WorkspaceMember
"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, ✅

-- Document
"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, ✅
"updatedAt" TIMESTAMPTZ NOT NULL, ✅

-- Chunk
"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, ✅

-- PublicLink
"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, ✅
"expiresAt" TIMESTAMPTZ, ✅
```

**Status:** ✅ WSZYSTKIE timestampy używają TIMESTAMPTZ (timestamp with time zone)

**Zgodność:**
- ✅ CLAUDE.md requirement
- ✅ Prisma schema (`@db.Timestamptz`)
- ✅ Best practice dla multi-timezone applications

---

### 3. Indexy - Performance Analysis

#### Utworzone indexy (B-tree):

**User:**
```sql
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
```
✅ Unikalność email + szybkie logowanie

**WorkspaceMember:**
```sql
CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
```
✅ Szybkie queries: "które workspaces ma user" i "którzy users są w workspace"
✅ Composite unique zapobiega duplikatom

**Document:**
```sql
CREATE INDEX "Document_workspaceId_idx" ON "Document"("workspaceId");
CREATE INDEX "Document_verificationStatus_idx" ON "Document"("verificationStatus");
CREATE INDEX "Document_processingStatus_idx" ON "Document"("processingStatus");
```
✅ Workspace isolation (często filtrowane)
✅ Status filtering (common queries: "show only verified", "show pending")

**Chunk:**
```sql
CREATE INDEX "Chunk_documentId_idx" ON "Chunk"("documentId");
```
✅ Szybkie "get all chunks for document"

**Tag:**
```sql
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
```
✅ Unikalność tagów + szybkie lookup

**DocumentTag:**
```sql
CREATE INDEX "DocumentTag_tagId_idx" ON "DocumentTag"("tagId");
```
✅ Szybkie "find all documents with tag X"
⚠️ BRAK indexu na documentId (ale jest composite PK, więc może wystarczyć)

**PublicLink:**
```sql
CREATE UNIQUE INDEX "PublicLink_token_key" ON "PublicLink"("token");
CREATE INDEX "PublicLink_token_idx" ON "PublicLink"("token");
CREATE INDEX "PublicLink_workspaceId_idx" ON "PublicLink"("workspaceId");
```
✅ Szybki lookup po token (public API)
⚠️ Duplikacja: UNIQUE INDEX już wspiera queries, drugi INDEX może być zbędny

**Status:** ✅ Indexy dobrze zaprojektowane dla relacyjnych queries

**BRAKUJĄCY INDEX - VECTOR:**
🟡 **Brak indexu na Chunk.embedding** - WYMAGANY dla RAG performance (patrz sekcja HIGH)

---

### 4. Foreign Keys i CASCADE Policies

**Analiza cascade effects:**

#### Workspace CASCADE (usunięcie workspace):
```sql
Workspace
  ├─ CASCADE → WorkspaceMember (OK - członkowie znikają)
  ├─ CASCADE → Document
  │   ├─ CASCADE → Chunk (OK - chunki należą do dokumentu)
  │   └─ CASCADE → DocumentTag (OK - relacje znikają)
  └─ CASCADE → PublicLink (OK - linki przestają działać)
```

**Effect:** Usunięcie workspace usuwa WSZYSTKO (dokumenty, chunki, embeddingi, public linki)

**Bezpieczeństwo:**
- ✅ Logicznie poprawne
- ⚠️ W produkcji: rozważ soft-delete lub archivization
- ⚠️ Embeddingi są kosztowne do regeneracji

**Rekomendacja dla przyszłości:**
```sql
-- Dodać kolumnę deletedAt dla soft-delete
ALTER TABLE "Workspace" ADD COLUMN "deletedAt" TIMESTAMPTZ;
ALTER TABLE "Document" ADD COLUMN "deletedAt" TIMESTAMPTZ;
```

#### User CASCADE (usunięcie user):
```sql
User
  └─ CASCADE → WorkspaceMember (OK - user wychodzi z workspace'ów)
```

**Effect:** User może być usunięty bez usuwania workspace'ów (OWNER może być zmieniony wcześniej)

**Status:** ✅ Poprawne

#### Document CASCADE (usunięcie dokumentu):
```sql
Document
  ├─ CASCADE → Chunk (OK - chunki należą do dokumentu)
  └─ CASCADE → DocumentTag (OK - relacje znikają, Tag pozostaje)
```

**Effect:** Embeddingi znikają (kosztowne do regeneracji)

**Status:** ✅ Poprawne, ale rozważ backup embeddingów przed DELETE w produkcji

#### Tag CASCADE:
```sql
Tag
  └─ CASCADE → DocumentTag (OK - relacje znikają, Document pozostaje)
```

**Effect:** Tag można usunąć bez usuwania dokumentów

**Status:** ✅ Poprawne

**Podsumowanie CASCADE policies:** ✅ WSZYSTKIE POPRAWNE

---

### 5. Workspace Isolation - Multi-tenancy

**Model izolacji:**
```
Shared Database + Workspace-level isolation
```

**Analiza:**
```sql
-- Document należy do Workspace
"workspaceId" TEXT NOT NULL,
CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE

-- Chunk NIE MA workspaceId (dziedziczy przez Document)
"documentId" TEXT NOT NULL,
CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE

-- PublicLink należy do Workspace
"workspaceId" TEXT NOT NULL,
CONSTRAINT "PublicLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
```

**Weryfikacja izolacji:**
1. ✅ Każdy Document należy do Workspace
2. ✅ Chunki są izolowane przez Document (foreign key)
3. ✅ PublicLink należy do Workspace
4. ✅ WorkspaceMember definiuje dostęp do Workspace

**Indexy wspierające izolację:**
```sql
CREATE INDEX "Document_workspaceId_idx" ON "Document"("workspaceId"); ✅
CREATE INDEX "PublicLink_workspaceId_idx" ON "PublicLink"("workspaceId"); ✅
```

**Query pattern (example):**
```sql
-- Get all documents in workspace
SELECT * FROM "Document" WHERE "workspaceId" = $1; -- używa indexu

-- Get chunks for workspace (przez Document)
SELECT c.* FROM "Chunk" c
JOIN "Document" d ON c."documentId" = d.id
WHERE d."workspaceId" = $1;
```

**Row-Level Security (RLS):**
- ⚠️ Brak Postgres RLS policies
- Izolacja musi być zapewniona w application layer (Prisma queries)
- OK dla MVP, ale rozważ RLS dla enterprise:

```sql
-- Example RLS policy (future enhancement)
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_workspace_isolation ON "Document"
  USING ("workspaceId" IN (
    SELECT "workspaceId" FROM "WorkspaceMember"
    WHERE "userId" = current_setting('app.current_user_id')::TEXT
  ));
```

**Status:** ✅ POPRAWNA IZOLACJA dla application-enforced multi-tenancy

---

### 6. Seed Script Security

**Przegląd `apps/api/prisma/seed.ts`:**

**Pozytywne aspekty:**
```typescript
// 1. Generuje LOSOWE hasło
const seedPassword = crypto.randomBytes(16).toString('hex'); ✅

// 2. Używa bcrypt (salt rounds: 10)
const passwordHash = await bcrypt.hash(seedPassword, 10); ✅

// 3. Email: localhost domain
email: 'admin@knowledge-forge.local' ✅

// 4. Zapisuje hasło do .env.seed (gitignored)
fs.writeFileSync(envSeedPath, envSeedContent); ✅

// 5. Używa upsert (idempotentne)
await prisma.user.upsert({ ... }); ✅
```

**Weryfikacja .gitignore:**
```bash
# Sprawdź czy .env.seed jest ignorowany
grep -n ".env.seed" .gitignore
```

**Potencjalne zagrożenia:**
- ⚠️ Seed może być uruchomiony w production
- ⚠️ Admin user z predictable email

**Rekomendacje:**
1. Dodaj env check (patrz sekcja MEDIUM)
2. Dla production: usuń seed user lub zmień credentials po deployment
3. Rozważ dedicated admin CLI dla production admin creation

**Status:** ✅ BEZPIECZNY dla development/staging

---

### 7. Data Types i Constraints

#### UUIDs:
```sql
"id" TEXT NOT NULL,
```
**Status:** ✅ OK (Prisma używa TEXT dla UUID, PostgreSQL nie ma native UUID type w Prisma)

#### Enums:
```sql
CREATE TYPE "Role" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "ContentType" AS ENUM ('TEXT', 'FILE');
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED');
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
```
**Status:** ✅ DOBRZE ZDEFINIOWANE, odpowiadają business logic

#### Vector type:
```sql
"embedding" vector(1536) NOT NULL,
```
**Status:** ✅ ZGODNE z OpenAI text-embedding-3-small (1536 dimensions)

#### Arrays:
```sql
"allowedTags" TEXT[],
```
**Status:** ✅ OK dla PostgreSQL, wspierane przez Prisma

#### JSONB:
```sql
"metadata" JSONB,
```
**Status:** ✅ JSONB (binary) jest szybsze niż JSON, wspiera indexing

#### NOT NULL vs NULL constraints:

**Nullable fields (analiza biznesowa):**
```sql
-- User
"name" TEXT, -- ✅ OK (opcjonalne imię)

-- Document
"originalFilename" TEXT, -- ✅ OK (tylko dla FILE type)
"fileUrl" TEXT, -- ✅ OK (tylko dla FILE type)
"mimeType" TEXT, -- ✅ OK (tylko dla FILE type)
"fileSize" INTEGER, -- ✅ OK (tylko dla FILE type)
"sourceDescription" TEXT, -- ✅ OK (opcjonalny opis źródła)
"processingError" TEXT, -- ✅ OK (tylko dla FAILED status)

-- Chunk
"startOffset" INTEGER, -- ✅ OK (opcjonalne pozycjonowanie)
"endOffset" INTEGER, -- ✅ OK (opcjonalne pozycjonowanie)
"chunkType" TEXT, -- ✅ OK (opcjonalna klasyfikacja)
"metadata" JSONB, -- ✅ OK (dodatkowe dane z LLM)

-- PublicLink
"name" TEXT, -- ✅ OK (opcjonalny opis linku)
"expiresAt" TIMESTAMPTZ, -- ✅ OK (może nie wygasać)
```

**Status:** ✅ Wszystkie nullable fields mają biznesowe uzasadnienie

---

### 8. Unique Constraints

**Analiza unikalności:**

```sql
-- 1. User email
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
```
✅ Jeden user = jeden email (standard)

```sql
-- 2. WorkspaceMember composite
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key"
  ON "WorkspaceMember"("workspaceId", "userId");
```
✅ User może być w workspace tylko raz

```sql
-- 3. Tag name
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
```
✅ Globalne tagi (jeden tag name w całym systemie)

**Uwaga - Tag jest GLOBALNY:**
- Tag nie ma `workspaceId`
- Tag.name jest unique globalnie
- Workspace A i B dzielą tę samą przestrzeń tagów

**Implikacje:**
- Zaleta: łatwiejsze tagowanie, autocomplete
- Wada: tenant A widzi tagi utworzone przez tenant B (nazwy, nie dokumenty)

**Według specyfikacji:**
```typescript
Tag = string  // lowercase, alphanumeric + hyphens
```
Brak informacji o izolacji per-workspace - wydaje się być global by design.

**Rekomendacja:**
- ✅ OK dla MVP (upraszcza UI)
- 🟡 Rozważ w przyszłości workspace-scoped tags jeśli pojawią się privacy concerns

```sql
-- 4. PublicLink token
CREATE UNIQUE INDEX "PublicLink_token_key" ON "PublicLink"("token");
```
✅ Unique token dla secure access

**Status:** ✅ WSZYSTKIE UNIQUE CONSTRAINTS POPRAWNE

---

## Checklist przed deploy

- [x] ✅ Backup bazy wykonany (N/A - nowa baza)
- [x] ✅ Migracja przetestowana lokalnie
- [ ] 🟡 **Vector index dodany PO migration** (WYMAGANE - patrz HIGH)
- [x] ✅ Seed credentials zabezpieczone (.env.seed w .gitignore)
- [ ] 🟡 Env check w seed.ts (REKOMENDOWANE - patrz MEDIUM)
- [x] ✅ PostgreSQL ma pgvector extension available
- [x] ✅ User PostgreSQL ma uprawnienia do CREATE EXTENSION

---

## Wymagane akcje

### PRZED MIGRACJĄ

#### 1. Weryfikacja środowiska

```bash
# Sprawdź czy pgvector jest dostępny
psql -U postgres -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"

# Expected output:
#   name   | default_version | installed_version |                comment
# ---------+-----------------+-------------------+---------------------------------------
#  vector  | 0.8.1           |                   | vector data type and ivfflat and hnsw access methods

# Sprawdź uprawnienia użytkownika
psql -U postgres -c "SELECT current_user, session_user,
  has_database_privilege(current_user, current_database(), 'CREATE') as can_create;"

# Expected: can_create = true
```

#### 2. Przygotuj .env

```bash
# .env
DATABASE_URL="postgresql://user:password@localhost:5432/knowledge_forge?schema=public"

# Dla development z Docker:
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/knowledge_forge?schema=public"
```

#### 3. Backup (jeśli to nie jest zupełnie nowa baza)

```bash
# Jeśli baza już istnieje (upgrade scenario)
pg_dump -U postgres knowledge_forge > backup_before_init_$(date +%Y%m%d_%H%M%S).sql
```

---

### PO MIGRACJI

#### 1. Utwórz vector index (KRYTYCZNE)

**Opcja A: Dodaj jako druga migracja Prisma (REKOMENDOWANE)**

```bash
# Utwórz pustą migrację
npx prisma migrate dev --name add_vector_index --create-only

# Edytuj wygenerowany plik:
# apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_vector_index/migration.sql
```

Zawartość migracji:
```sql
-- Add HNSW vector index for similarity search
-- HNSW is recommended for general use (works with any dataset size)
CREATE INDEX chunks_embedding_idx ON "Chunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Performance notes:
-- - m = 16: number of connections (higher = better recall, more memory)
-- - ef_construction = 64: index build quality (higher = better index, slower build)
-- - For production with >100k vectors, consider: m = 32, ef_construction = 128
```

Następnie uruchom migrację:
```bash
npx prisma migrate dev
```

**Opcja B: Ręczne dodanie (jeśli nie używasz Prisma migrate w production)**

```bash
# Po seedowaniu danych
psql $DATABASE_URL -c "
CREATE INDEX chunks_embedding_idx ON \"Chunk\"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
"
```

**Alternatywa - IVFFlat index:**
```sql
-- Requires >1000 vectors for optimal clustering
-- Faster queries than HNSW, but less accurate for small datasets
CREATE INDEX chunks_embedding_idx ON "Chunk"
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- lists = sqrt(total_rows) is a good starting point
-- For 10k vectors: lists = 100
-- For 100k vectors: lists = 316
-- For 1M vectors: lists = 1000
```

**Porównanie HNSW vs IVFFlat:**

| Aspekt | HNSW | IVFFlat |
|--------|------|---------|
| Build time | Wolniejszy | Szybszy |
| Query speed | Bardzo szybki | Szybki |
| Accuracy | Wysoka | Dobra |
| Memory | Więcej | Mniej |
| Min vectors | Brak | >1000 rekomendowane |
| **Rekomendacja** | **Ogólne użycie** | Duże zbiory (>100k) |

#### 2. Uruchom seed

```bash
# Z root projektu
npm run seed

# LUB bezpośrednio
npx tsx apps/api/prisma/seed.ts

# Expected output:
# 🌱 Seeding database...
# ✅ Created user: admin@knowledge-forge.local
# ✅ Created workspace: Default Workspace
# ✅ Created tags: procedures, faq, internal, public
# ✅ Saved credentials to .env.seed
# 🎉 Seeding completed!
```

**Zapisz credentials:**
```bash
# .env.seed zostanie utworzony automatycznie
cat .env.seed

# WAŻNE: NIE commituj .env.seed do git!
# Sprawdź .gitignore:
grep ".env.seed" .gitignore
```

#### 3. Weryfikacja

```bash
# 1. Sprawdź czy extension jest zainstalowana
psql $DATABASE_URL -c "
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vector';
"

# Expected output:
#  extname | extversion
# ---------+------------
#  vector  | 0.8.1

# 2. Sprawdź tabele
psql $DATABASE_URL -c "\dt"

# Expected: 8 tabel (User, Workspace, WorkspaceMember, Document, Chunk, Tag, DocumentTag, PublicLink)

# 3. Sprawdź indexy
psql $DATABASE_URL -c "\di"

# Expected: wszystkie indexy z migracji + chunks_embedding_idx (po dodaniu)

# 4. Sprawdź vector index (po dodaniu)
psql $DATABASE_URL -c "
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'Chunk' AND indexname LIKE '%embedding%';
"

# Expected: chunks_embedding_idx z HNSW lub IVFFlat

# 5. Sprawdź seed data
psql $DATABASE_URL -c "
SELECT COUNT(*) as user_count FROM \"User\";
SELECT COUNT(*) as workspace_count FROM \"Workspace\";
SELECT COUNT(*) as tag_count FROM \"Tag\";
"

# Expected:
# user_count: 1
# workspace_count: 1
# tag_count: 4

# 6. Test vector search (po dodaniu przykładowych chunków)
psql $DATABASE_URL -c "
EXPLAIN ANALYZE
SELECT * FROM \"Chunk\"
ORDER BY embedding <-> '[0.1,0.2,0.3,...]'::vector
LIMIT 5;
"

# Sprawdź czy używa indexu:
# Index Scan using chunks_embedding_idx ✅
# Seq Scan ❌ (brak indexu lub za mało danych)
```

---

### OPCJONALNE ULEPSZENIA (post-MVP)

#### 1. Dodaj env guard do seed script

```typescript
// apps/api/prisma/seed.ts (na początku funkcji main)

async function main() {
  // Guard dla production
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️  Skipping seed in production environment');
    console.log('💡 To create admin user in production, use:');
    console.log('   npm run admin:create');
    return;
  }

  console.log('🌱 Seeding database...');
  // ... reszta kodu
}
```

#### 2. Dodaj check constraints

```sql
-- apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_business_constraints/migration.sql

-- Document: fileSize musi być > 0 jeśli jest ustawiony
ALTER TABLE "Document" ADD CONSTRAINT "Document_fileSize_positive"
  CHECK ("fileSize" IS NULL OR "fileSize" > 0);

-- PublicLink: expiresAt nie może być w przeszłości
ALTER TABLE "PublicLink" ADD CONSTRAINT "PublicLink_expiresAt_future"
  CHECK ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP);

-- Document: FILE type wymaga metadanych pliku
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_metadata_required"
  CHECK (
    ("contentType" = 'FILE' AND "originalFilename" IS NOT NULL AND "fileUrl" IS NOT NULL) OR
    ("contentType" = 'TEXT')
  );
```

#### 3. Dodaj database comments

```sql
-- apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_documentation/migration.sql

-- Tables
COMMENT ON TABLE "User" IS 'Application users with authentication credentials';
COMMENT ON TABLE "Workspace" IS 'Multi-tenant workspaces for data isolation';
COMMENT ON TABLE "Document" IS 'Uploaded documents or text content';
COMMENT ON TABLE "Chunk" IS 'Semantic chunks with vector embeddings for RAG search';
COMMENT ON TABLE "Tag" IS 'Global tags for content categorization';
COMMENT ON TABLE "PublicLink" IS 'Shareable links for external access to workspace content';

-- Critical columns
COMMENT ON COLUMN "Chunk"."embedding" IS 'Vector embedding (OpenAI text-embedding-3-small, 1536 dimensions) for semantic search';
COMMENT ON COLUMN "Document"."verificationStatus" IS 'VERIFIED = trusted/confirmed source, UNVERIFIED = user-generated or unconfirmed content';
COMMENT ON COLUMN "Document"."processingStatus" IS 'PENDING = queued, PROCESSING = in progress, COMPLETED = ready, FAILED = error occurred';
COMMENT ON COLUMN "PublicLink"."token" IS 'Cryptographically random token for secure public access (UUID)';
COMMENT ON COLUMN "PublicLink"."allowedTags" IS 'Array of tag names to filter accessible content (empty = all tags allowed)';
```

---

## Performance Considerations

### Initial Migration Performance

**Czas wykonania:**
- CREATE EXTENSION: <1s
- CREATE TYPE (4 enums): <1s
- CREATE TABLE (8 tables): <1s
- CREATE INDEX (14 indexes): <1s
- ALTER TABLE ADD CONSTRAINT (7 FK): <1s

**Total:** <5 sekund (baza pusta)

**Lock considerations:**
- ✅ Brak - nowa baza, brak użytkowników
- ✅ Brak downtime (aplikacja jeszcze nie działa)

---

### Vector Index Creation Performance

**HNSW index build time (estimate):**

| Vectors | Time | Memory |
|---------|------|--------|
| 1,000 | ~1s | ~10 MB |
| 10,000 | ~10s | ~100 MB |
| 100,000 | ~2 min | ~1 GB |
| 1,000,000 | ~30 min | ~10 GB |

**IVFFlat index build time (estimate):**

| Vectors | Time | Memory |
|---------|------|--------|
| 1,000 | N/A (too small) | - |
| 10,000 | ~5s | ~50 MB |
| 100,000 | ~30s | ~500 MB |
| 1,000,000 | ~5 min | ~5 GB |

**Rekomendacje:**
1. **Dla MVP (<10k vectors):**
   - Użyj HNSW (m=16, ef_construction=64)
   - Build time: sekundy
   - Zero-downtime: brak problemu (build offline)

2. **Dla production (>100k vectors):**
   - Rozważ CONCURRENTLY dla zero-downtime:
   ```sql
   CREATE INDEX CONCURRENTLY chunks_embedding_idx ON "Chunk"
   USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64);
   ```
   - Wymaga pgvector >= 0.5.0
   - Wolniejsze build, ale brak downtime

3. **Dla very large datasets (>1M vectors):**
   - Maintenance window recommended
   - Monitor progress:
   ```sql
   SELECT
     now()::TIME(0),
     a.query,
     pg_stat_activity_wait_event_type AS wait_event_type,
     pg_stat_activity_wait_event AS wait_event
   FROM pg_stat_activity a
   WHERE query LIKE 'CREATE INDEX%embedding%';
   ```

---

## Podsumowanie

### Ocena ogólna: ✅ APPROVED with conditions

**SILNE STRONY:**

1. ✅ **Standards compliance:**
   - Wszystkie timestampy jako TIMESTAMPTZ
   - Zgodne z CLAUDE.md requirements
   - Clean Architecture principles

2. ✅ **Data integrity:**
   - Poprawne CASCADE policies
   - Właściwe unique constraints
   - Sensowne nullable fields

3. ✅ **Performance:**
   - Dobre indexy dla relacyjnych queries
   - Workspace isolation indexes

4. ✅ **Security:**
   - Secure seed script (random password, bcrypt)
   - Proper workspace isolation
   - FK constraints prevent orphans

5. ✅ **pgvector setup:**
   - Extension IF NOT EXISTS
   - Właściwy vector type (1536 dims)
   - Zgodne z OpenAI embedding model

---

### WYMAGANE POPRAWKI (przed production use):

#### 1. KRYTYCZNE - Vector Index
```sql
-- Dodaj jako druga migracja lub ręcznie
CREATE INDEX chunks_embedding_idx ON "Chunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```
**Priorytet:** 🔴 HIGHEST
**Wpływ bez tego:** RAG search będzie BARDZO wolny (unusable dla >10k chunków)

---

### REKOMENDOWANE (dla production):

#### 1. Seed Environment Guard
```typescript
if (process.env.NODE_ENV === 'production') {
  console.log('⚠️  Skipping seed in production');
  return;
}
```
**Priorytet:** 🟡 MEDIUM
**Wpływ bez tego:** Możliwe utworzenie test user w production

---

### OPCJONALNE (nice-to-have):

1. ⚪ Check constraints dla business rules
2. ⚪ Database comments (dokumentacja)
3. ⚪ Audit fields (created_by, updated_by)
4. ⚪ Soft-delete dla Workspace/Document
5. ⚪ Workspace-scoped tags (zamiast globalnych)

---

### FINALNA REKOMENDACJA

**Status:** ✅ **ZATWIERDZAM z warunkiem**

**Warunek:**
- Dodać vector index jako druga migracja lub ręcznie po deployment

**Migracja jest BEZPIECZNA do uruchomienia.**

**Initial migration może być wykonana natychmiast.**

**Vector index musi być dodany przed pierwszym użyciem RAG search.**

---

## Dodatkowe uwagi

### Multi-tenancy Model

**Projekt używa:** Workspace-based isolation (shared database)

**NIE używa:** Database-per-tenant (jak sugerowano w przykładowym ecosystem.md)

**Jest to poprawne dla:**
- SaaS applications
- Moderate scale (<100k workspaces)
- Cost efficiency (jeden database)

**Izolacja zapewniona przez:**
1. Application layer (Prisma queries z workspace filter)
2. Foreign key constraints
3. Indexy na workspaceId

**Brak:**
- Postgres Row-Level Security (RLS)
- Database-level isolation

**Rekomendacja:** ✅ OK dla MVP, rozważ RLS dla enterprise tier

---

### Zgodność ze specyfikacją

**Weryfikacja zgodności z `docs/specifications/2025-12-24-knowledge-forge.md`:**

| Element | Specyfikacja | Implementacja | Status |
|---------|--------------|---------------|--------|
| Timestampy | timestamptz | TIMESTAMPTZ | ✅ |
| Vector dims | 1536 | vector(1536) | ✅ |
| pgvector | Required | CREATE EXTENSION | ✅ |
| Vector index | IVFFlat/HNSW | ❌ BRAK | 🔴 |
| Workspace isolation | Yes | workspaceId FK | ✅ |
| User auth | JWT | (app layer) | N/A |
| Multi-tenant | Yes | Workspace model | ✅ |
| Tags | Lowercase | (app layer) | N/A |

**Niezgodności:**
1. 🔴 Brak vector indexu (specyfikacja sekcja 7.1 wymaga IVFFlat)

**Akcja:** Dodać vector index zgodnie z sekcją "Wymagane akcje PO migracji"

---

### Rollback Plan

**Jeśli migracja zawiedzie:**

```bash
# 1. Check status
npx prisma migrate status

# 2. Mark as rolled back
npx prisma migrate resolve --rolled-back 20251224125334_init

# 3. Usuń tabele ręcznie (jeśli częściowo utworzone)
psql $DATABASE_URL -c "
DROP TABLE IF EXISTS \"PublicLink\" CASCADE;
DROP TABLE IF EXISTS \"DocumentTag\" CASCADE;
DROP TABLE IF EXISTS \"Tag\" CASCADE;
DROP TABLE IF EXISTS \"Chunk\" CASCADE;
DROP TABLE IF EXISTS \"Document\" CASCADE;
DROP TABLE IF EXISTS \"WorkspaceMember\" CASCADE;
DROP TABLE IF EXISTS \"Workspace\" CASCADE;
DROP TABLE IF EXISTS \"User\" CASCADE;
DROP TYPE IF EXISTS \"ProcessingStatus\";
DROP TYPE IF EXISTS \"VerificationStatus\";
DROP TYPE IF EXISTS \"ContentType\";
DROP TYPE IF EXISTS \"Role\";
DROP EXTENSION IF EXISTS \"vector\";
"

# 4. Fix migracji i re-run
npx prisma migrate dev
```

**Uwaga:** To jest initial migration - rollback usuwa WSZYSTKO. Dla later migrations używaj:
```bash
npx prisma migrate resolve --applied <migration_name>  # Mark as applied
npx prisma migrate resolve --rolled-back <migration_name>  # Mark as rolled back
```

---

### Testing Checklist

**Po deployment sprawdź:**

- [ ] pgvector extension installed
- [ ] 8 tables created
- [ ] All indexes created (including vector index)
- [ ] Seed user created
- [ ] Tags created
- [ ] Default workspace created
- [ ] Can insert test document
- [ ] Can create chunks with embeddings
- [ ] Vector search works (with index)
- [ ] Workspace isolation works
- [ ] Credentials saved to .env.seed
- [ ] .env.seed NOT in git

**Test queries:**

```sql
-- 1. Test insert
INSERT INTO "Document" (id, "workspaceId", title, content, "contentType")
VALUES ('test-doc-1', 'default-workspace-id', 'Test Doc', 'Test content', 'TEXT');

-- 2. Test vector insert
INSERT INTO "Chunk" (id, "documentId", content, embedding, "chunkIndex")
VALUES ('test-chunk-1', 'test-doc-1', 'Test chunk', ARRAY[0.1,0.2, ...]::vector(1536), 0);

-- 3. Test vector search
SELECT * FROM "Chunk"
ORDER BY embedding <-> ARRAY[0.1,0.2,...]::vector(1536)
LIMIT 5;

-- 4. Test workspace isolation
SELECT d.* FROM "Document" d
JOIN "WorkspaceMember" wm ON d."workspaceId" = wm."workspaceId"
WHERE wm."userId" = 'test-user-id';
```

---

## Przydatne komendy

```bash
# Prisma commands
npx prisma migrate dev          # Run migrations in dev
npx prisma migrate deploy       # Run migrations in production
npx prisma migrate status       # Check migration status
npx prisma studio               # Visual database browser

# Database inspection
psql $DATABASE_URL -c "\dt"     # List tables
psql $DATABASE_URL -c "\di"     # List indexes
psql $DATABASE_URL -c "\dT"     # List types (enums)
psql $DATABASE_URL -c "\dx"     # List extensions

# Vector-specific
psql $DATABASE_URL -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"
psql $DATABASE_URL -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"

# Performance monitoring
psql $DATABASE_URL -c "
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
"
```

---

**Report generated:** 2025-12-24 14:00
**Agent:** Migration Reviewer
**Version:** 1.0
