# Synjar Community - Specyfikacja MVP

**Data:** 2025-12-24
**Status:** In Progress

---

## 1. Przegląd

Synjar Community to self-hosted RAG backend - serwis do zarządzania bazą wiedzy z funkcją RAG (Retrieval Augmented Generation).

### 1.1 Kluczowe cechy

- **API-first** - REST API z Swagger/OpenAPI
- **Multi-workspace** - separacja danych, współdzielone workspace'y
- **File upload** - użytkownik wrzuca pliki (PDF, DOCX, TXT, MD)
- **Smart chunking** - inteligentny podział dokumentów (LLM-based)
- **Tagging** - elastyczny system tagów
- **Public links** - udostępnianie wiedzy przez tokeny
- **Verification status** - rozróżnienie źródeł zweryfikowanych/niezweryfikowanych

### 1.2 Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Backend | NestJS (TypeScript) |
| ORM | Prisma |
| Database | PostgreSQL + pgvector |
| Embeddings | OpenAI text-embedding-3-small |
| Frontend | React + Vite |
| File Storage | Backblaze B2 |
| API Docs | Swagger/OpenAPI |
| Container | Docker |
| Monorepo | pnpm workspaces |

---

## 2. Use Cases

### UC1: Zapisanie zweryfikowanego źródła

**Aktor:** User
**Cel:** Dodanie sprawdzonego dokumentu do bazy wiedzy

**Flow:**
1. User wybiera workspace
2. User wrzuca plik (PDF/DOCX/TXT/MD) lub wpisuje tekst
3. User oznacza dokument jako "verified"
4. User dodaje tagi
5. System uploaduje plik do B2 (jeśli plik)
6. System dzieli dokument na chunki (smart chunking)
7. System generuje embeddingi i zapisuje w pgvector

### UC2: Zapisanie niezweryfikowanego źródła

**Aktor:** User
**Cel:** Dodanie niepotwierdzonego źródła (email, raport LLM, fragmenty)

**Flow:**
1. User wybiera workspace
2. User wrzuca plik lub wpisuje tekst
3. User dodaje opis źródła (np. "email od klienta", "raport GPT")
4. System oznacza jako "unverified"
5. User dodaje tagi
6. System przetwarza jak w UC1

### UC3: Generowanie publicznego linku

**Aktor:** User
**Cel:** Udostępnienie bazy wiedzy przez unikalny link

**Flow:**
1. User wybiera workspace
2. User wybiera zakres: wszystkie tagi lub wybrane
3. User opcjonalnie ustawia datę wygaśnięcia
4. System generuje unikalny token
5. User otrzymuje URL: `https://api.example.com/public/{token}`

### UC4: Pobieranie treści przez publiczny link

**Aktor:** External system (LLM, aplikacja)
**Cel:** Pobranie wiedzy pasującej do zapytania

**Flow:**
1. System zewnętrzny wywołuje `GET /public/{token}?query=...&tags=...`
2. API weryfikuje token i sprawdza scope
3. Jeśli query podane - wyszukuje semantycznie (RAG)
4. Jeśli bez query - zwraca wszystkie dostępne dokumenty
5. Zwraca wyniki ograniczone do dozwolonych tagów

### UC5: Przeglądanie treści przez usera

**Aktor:** User
**Cel:** Wyszukiwanie i przeglądanie dokumentów

**Flow:**
1. User wchodzi na dashboard
2. User filtruje po tagach
3. User wpisuje query (opcjonalnie)
4. System pokazuje pasujące dokumenty
5. Dla plików w B2 - pokazuje linki do pobrania

---

## 3. Model domeny (DDD)

### 3.1 Bounded Contexts

```
┌─────────────────────────────────────────────────────────────┐
│                    SYNJAR COMMUNITY                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ WORKSPACE       │  │ CONTENT         │                  │
│  │ CONTEXT         │  │ CONTEXT         │                  │
│  │                 │  │                 │                  │
│  │ • Workspace     │  │ • Document      │                  │
│  │ • Member        │  │ • Chunk         │                  │
│  │                 │  │ • Tag           │                  │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                            │
│           └──────────┬─────────┘                            │
│                      │                                      │
│  ┌─────────────────┐ │ ┌─────────────────┐                 │
│  │ ACCESS          │◄┘ │ SEARCH          │                 │
│  │ CONTEXT         │   │ CONTEXT         │                 │
│  │                 │   │                 │                 │
│  │ • PublicLink    │   │ • RAG Query     │                 │
│  │ • Token         │   │ • Embeddings    │                 │
│  └─────────────────┘   └─────────────────┘                 │
│                                                             │
│  ┌─────────────────┐                                       │
│  │ PROCESSING      │                                       │
│  │ CONTEXT         │                                       │
│  │                 │                                       │
│  │ • Chunking      │                                       │
│  │ • FileParser    │                                       │
│  └─────────────────┘                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Aggregates i Entities

#### Workspace (Aggregate Root)

```typescript
Workspace {
  id: UUID
  name: string
  createdAt: DateTime
  updatedAt: DateTime

  members: WorkspaceMember[]
}

WorkspaceMember {
  id: UUID
  workspaceId: UUID
  userId: UUID
  role: Role                     // OWNER | MEMBER
  createdAt: DateTime
}
```

#### Document (Aggregate Root)

```typescript
Document {
  id: UUID
  workspaceId: UUID

  title: string
  content: string                // markdown / extracted text
  contentType: ContentType       // TEXT | FILE

  // File storage (jeśli FILE)
  originalFilename?: string
  fileUrl?: string               // Backblaze B2 URL
  mimeType?: string
  fileSize?: number

  // Metadata
  sourceDescription?: string     // "email od klienta", "raport GPT-4"
  verificationStatus: Status     // VERIFIED | UNVERIFIED

  // Processing
  processingStatus: ProcessingStatus  // PENDING | PROCESSING | COMPLETED | FAILED

  tags: Tag[]
  chunks: Chunk[]

  createdAt: DateTime
  updatedAt: DateTime
}

Chunk {
  id: UUID
  documentId: UUID

  content: string
  embedding: vector(1536)        // OpenAI text-embedding-3-small

  // Position in document
  chunkIndex: number
  startOffset?: number
  endOffset?: number

  // Metadata from chunking
  chunkType?: string             // "chapter", "section", "paragraph"
  metadata?: JSON                // dodatkowe info z LLM

  createdAt: DateTime
}
```

#### PublicLink (Aggregate Root)

```typescript
PublicLink {
  id: UUID
  token: string                  // unique, cryptographically random
  workspaceId: UUID

  name?: string                  // opis linku
  allowedTags: string[]          // puste = wszystkie
  expiresAt?: DateTime
  isActive: boolean

  createdAt: DateTime
}
```

### 3.3 Value Objects

```typescript
ContentType = "TEXT" | "FILE"

VerificationStatus = "VERIFIED" | "UNVERIFIED"

ProcessingStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"

Role = "OWNER" | "MEMBER"

Tag = string  // lowercase, alphanumeric + hyphens
```

---

## 4. Smart Chunking Strategy

### 4.1 Problem

Dokumenty mają różne rozmiary i struktury:
- Krótki tekst (< 1000 tokenów) - nie wymaga dzielenia
- Średni dokument (1000-10000 tokenów) - smart chunking z LLM
- Duży dokument/książka (> 10000 tokenów) - hierarchiczny podział

### 4.2 Strategia

```
┌─────────────────────────────────────────────────────────────┐
│                    CHUNKING PIPELINE                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. FILE PARSING                                            │
│     ├── PDF → text (pdf-parse / pdf.js)                    │
│     ├── DOCX → text (mammoth)                              │
│     ├── MD → text (as-is)                                  │
│     └── TXT → text (as-is)                                 │
│                                                             │
│  2. SIZE DETECTION                                          │
│     └── Count tokens (tiktoken)                            │
│                                                             │
│  3. CHUNKING STRATEGY SELECTION                             │
│     │                                                       │
│     ├── < 1000 tokens: NO SPLIT                            │
│     │   └── Cały dokument = 1 chunk                        │
│     │                                                       │
│     ├── 1000-10000 tokens: LLM SMART CHUNKING              │
│     │   └── GPT-4o-mini dzieli na semantyczne części       │
│     │                                                       │
│     └── > 10000 tokens: HIERARCHICAL SPLIT                 │
│         ├── Krok 1: Podział strukturalny                   │
│         │   ├── PDF: po stronach/sekcjach                  │
│         │   ├── MD: po nagłówkach (##, ###)                │
│         │   └── TXT: po pustych liniach / akapitach        │
│         │                                                   │
│         └── Krok 2: LLM Smart Chunking na każdej sekcji    │
│                                                             │
│  4. EMBEDDING GENERATION                                    │
│     └── OpenAI text-embedding-3-small (1536 dims)          │
│                                                             │
│  5. STORAGE                                                 │
│     └── PostgreSQL + pgvector                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 LLM Smart Chunking Prompt

```
System: You are a document chunking assistant. Your task is to split
the given text into semantically coherent chunks suitable for RAG retrieval.

Rules:
1. Each chunk should be self-contained and make sense on its own
2. Keep related information together
3. Target chunk size: 200-500 tokens
4. Preserve important context (who, what, when, where)
5. Return JSON array of chunks with metadata

Input: [document text]

Output format:
{
  "chunks": [
    {
      "content": "...",
      "type": "introduction|definition|procedure|example|conclusion",
      "summary": "one-line summary for indexing"
    }
  ]
}
```

### 4.4 Fallback: Fixed-Size Chunking

Gdy LLM chunking nie działa lub jest za drogi:

```typescript
{
  chunkSize: 512,        // tokens
  chunkOverlap: 64,      // 12.5% overlap
  separator: "\n\n"      // preferuj podział na akapitach
}
```

---

## 5. File Upload Flow

### 5.1 Sequence Diagram

```
┌────────┐     ┌─────────┐     ┌────────┐     ┌─────────┐     ┌────────┐
│ Client │     │   API   │     │   B2   │     │  Queue  │     │ Worker │
└───┬────┘     └────┬────┘     └───┬────┘     └────┬────┘     └───┬────┘
    │               │              │               │              │
    │ POST /documents              │               │              │
    │ (multipart/form-data)        │               │              │
    │──────────────►│              │               │              │
    │               │              │               │              │
    │               │ Upload file  │               │              │
    │               │─────────────►│               │              │
    │               │              │               │              │
    │               │ File URL     │               │              │
    │               │◄─────────────│               │              │
    │               │              │               │              │
    │               │ Create Document              │              │
    │               │ (status: PENDING)            │              │
    │               │              │               │              │
    │               │ Enqueue job  │               │              │
    │               │──────────────────────────────►│              │
    │               │              │               │              │
    │ 202 Accepted  │              │               │              │
    │ { id, status }│              │               │              │
    │◄──────────────│              │               │              │
    │               │              │               │ Process job  │
    │               │              │               │─────────────►│
    │               │              │               │              │
    │               │              │               │   1. Parse   │
    │               │              │               │   2. Chunk   │
    │               │              │               │   3. Embed   │
    │               │              │               │   4. Store   │
    │               │              │               │              │
    │               │              │    Update status: COMPLETED  │
    │               │◄─────────────────────────────────────────────│
    │               │              │               │              │
```

### 5.2 Obsługiwane formaty

| Format | Parser | Uwagi |
|--------|--------|-------|
| PDF | pdf-parse | Ekstrakacja tekstu, OCR opcjonalnie |
| DOCX | mammoth | Zachowuje strukturę |
| TXT | - | As-is |
| MD | - | As-is, zachowuje formatowanie |

### 5.3 Limity

| Parametr | Wartość |
|----------|---------|
| Max file size | 10 MB |
| Max files per request | 10 |
| Supported MIME types | application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, text/markdown |

---

## 6. API Design

### 6.1 Authentication

- **Internal API:** JWT Bearer token
- **Public API:** Token w URL path (`/public/{token}`)

### 6.2 Base URL

```
/api/v1
```

### 6.3 Endpoints

#### Auth

```
POST   /auth/register              # Register user
POST   /auth/login                 # Login, returns JWT
POST   /auth/refresh               # Refresh token
```

#### Workspaces

```
POST   /workspaces                 # Create workspace
GET    /workspaces                 # List user's workspaces
GET    /workspaces/:id             # Get workspace
PUT    /workspaces/:id             # Update workspace
DELETE /workspaces/:id             # Delete workspace

# Members
POST   /workspaces/:id/members     # Add member
GET    /workspaces/:id/members     # List members
DELETE /workspaces/:id/members/:userId  # Remove member
```

#### Documents

```
POST   /workspaces/:wsId/documents           # Create/upload document
GET    /workspaces/:wsId/documents           # List documents
GET    /workspaces/:wsId/documents/:id       # Get document
PUT    /workspaces/:wsId/documents/:id       # Update document
DELETE /workspaces/:wsId/documents/:id       # Delete document

# Query params for list:
# ?tags=tag1,tag2
# ?status=verified|unverified
# ?processingStatus=pending|processing|completed|failed
# ?page=1&limit=20
```

#### Search (RAG)

```
POST   /workspaces/:wsId/search

Body:
{
  "query": "Jak obsłużyć reklamację?",
  "tags": ["support", "procedures"],     // opcjonalne
  "limit": 10,
  "includeUnverified": false             // domyślnie false
}

Response:
{
  "results": [
    {
      "documentId": "...",
      "chunkId": "...",
      "title": "Procedura reklamacji",
      "content": "W przypadku reklamacji należy...",
      "score": 0.89,
      "tags": ["support", "procedures"],
      "verificationStatus": "VERIFIED",
      "fileUrl": null
    }
  ],
  "totalCount": 42
}
```

#### Public Links

```
POST   /workspaces/:wsId/public-links        # Create public link
GET    /workspaces/:wsId/public-links        # List links
GET    /workspaces/:wsId/public-links/:id    # Get link details
DELETE /workspaces/:wsId/public-links/:id    # Revoke link
```

#### Public API (no auth required)

```
GET    /public/:token                        # Get available content info
GET    /public/:token/documents              # List documents
POST   /public/:token/search                 # Search content

# Query params:
# ?tags=tag1,tag2
# ?query=search text
# ?limit=10
```

### 6.4 Swagger

Dostępny pod `/api/docs` (Swagger UI) i `/api/docs-json` (OpenAPI JSON).

---

## 7. Data Model (Prisma)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

// ============ AUTH ============

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String?

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  workspaces   WorkspaceMember[]
}

// ============ WORKSPACE ============

model Workspace {
  id        String   @id @default(uuid())
  name      String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members     WorkspaceMember[]
  documents   Document[]
  publicLinks PublicLink[]
}

model WorkspaceMember {
  id          String    @id @default(uuid())
  workspaceId String
  userId      String
  role        Role      @default(MEMBER)

  createdAt   DateTime  @default(now())

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
}

enum Role {
  OWNER
  MEMBER
}

// ============ DOCUMENTS ============

model Document {
  id                 String             @id @default(uuid())
  workspaceId        String

  title              String
  content            String             @db.Text
  contentType        ContentType        @default(TEXT)

  // File storage
  originalFilename   String?
  fileUrl            String?
  mimeType           String?
  fileSize           Int?

  // Metadata
  sourceDescription  String?
  verificationStatus VerificationStatus @default(UNVERIFIED)
  processingStatus   ProcessingStatus   @default(PENDING)
  processingError    String?

  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  workspace          Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tags               DocumentTag[]
  chunks             Chunk[]
}

model Chunk {
  id          String                      @id @default(uuid())
  documentId  String

  content     String                      @db.Text
  embedding   Unsupported("vector(1536)")

  chunkIndex  Int
  startOffset Int?
  endOffset   Int?
  chunkType   String?
  metadata    Json?

  createdAt   DateTime                    @default(now())

  document    Document                    @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
}

model Tag {
  id        String        @id @default(uuid())
  name      String        @unique

  documents DocumentTag[]
}

model DocumentTag {
  documentId String
  tagId      String

  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  tag        Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([documentId, tagId])
}

enum ContentType {
  TEXT
  FILE
}

enum VerificationStatus {
  VERIFIED
  UNVERIFIED
}

enum ProcessingStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

// ============ PUBLIC ACCESS ============

model PublicLink {
  id          String    @id @default(uuid())
  token       String    @unique @default(uuid())
  workspaceId String

  name        String?
  allowedTags String[]
  expiresAt   DateTime?
  isActive    Boolean   @default(true)

  createdAt   DateTime  @default(now())

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([token])
}
```

### 7.1 pgvector Setup

```sql
-- Migration: enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Index for similarity search
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

---

## 8. Projekt struktury (Monorepo)

```
synjar/community/
├── package.json                      # Root package.json (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json                        # Turborepo config
├── docker-compose.yml
├── .env.example
│
├── apps/
│   ├── api/                          # NestJS Backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       │
│   │       ├── domain/               # Domain Layer
│   │       │   ├── user/
│   │       │   │   └── user.entity.ts
│   │       │   ├── workspace/
│   │       │   │   ├── workspace.entity.ts
│   │       │   │   └── workspace-member.entity.ts
│   │       │   ├── document/
│   │       │   │   ├── document.entity.ts
│   │       │   │   ├── chunk.entity.ts
│   │       │   │   └── document.repository.ts
│   │       │   └── public-link/
│   │       │       └── public-link.entity.ts
│   │       │
│   │       ├── application/          # Application Layer
│   │       │   ├── auth/
│   │       │   │   └── auth.service.ts
│   │       │   ├── workspace/
│   │       │   │   └── workspace.service.ts
│   │       │   ├── document/
│   │       │   │   ├── document.service.ts
│   │       │   │   └── document-processor.service.ts
│   │       │   ├── chunking/
│   │       │   │   ├── chunking.service.ts
│   │       │   │   ├── strategies/
│   │       │   │   │   ├── no-split.strategy.ts
│   │       │   │   │   ├── llm-smart.strategy.ts
│   │       │   │   │   └── hierarchical.strategy.ts
│   │       │   │   └── parsers/
│   │       │   │       ├── pdf.parser.ts
│   │       │   │       ├── docx.parser.ts
│   │       │   │       └── text.parser.ts
│   │       │   ├── search/
│   │       │   │   └── search.service.ts
│   │       │   └── public-link/
│   │       │       └── public-link.service.ts
│   │       │
│   │       ├── infrastructure/       # Infrastructure Layer
│   │       │   ├── persistence/
│   │       │   │   ├── prisma/
│   │       │   │   │   ├── prisma.module.ts
│   │       │   │   │   └── prisma.service.ts
│   │       │   │   └── repositories/
│   │       │   │       ├── document.repository.impl.ts
│   │       │   │       └── chunk.repository.impl.ts
│   │       │   ├── embeddings/
│   │       │   │   └── openai-embeddings.service.ts
│   │       │   ├── llm/
│   │       │   │   └── openai-llm.service.ts
│   │       │   ├── storage/
│   │       │   │   └── backblaze.service.ts
│   │       │   └── queue/
│   │       │       └── bull.module.ts
│   │       │
│   │       └── interfaces/           # Interface Layer
│   │           ├── http/
│   │           │   ├── auth.controller.ts
│   │           │   ├── workspace.controller.ts
│   │           │   ├── document.controller.ts
│   │           │   ├── search.controller.ts
│   │           │   └── public.controller.ts
│   │           └── dto/
│   │               ├── create-document.dto.ts
│   │               ├── search.dto.ts
│   │               └── ...
│   │
│   └── web/                          # React Frontend
│       ├── package.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── features/
│           │   ├── auth/
│           │   ├── workspaces/
│           │   ├── documents/
│           │   ├── search/
│           │   └── public-links/
│           └── shared/
│               ├── components/
│               ├── hooks/
│               └── api/
│
├── packages/
│   └── shared/                       # Shared types/utils
│       ├── package.json
│       └── src/
│           └── types/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
└── docs/
    ├── README.md
    ├── specifications/
    │   └── 2025-12-24-synjar-mvp.md
    └── ARCHITECTURE_DECISION.md
```

---

## 9. Audytor konfliktów (opcjonalnie - Faza 2+)

### 9.1 Idea

System wykrywający sprzeczności między dokumentami w bazie wiedzy.

### 9.2 Podejście

```
┌─────────────────────────────────────────────────────────────┐
│                 CONFLICT AUDITOR                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. TRIGGER                                                 │
│     └── Po dodaniu nowego dokumentu lub na żądanie          │
│                                                             │
│  2. CANDIDATE SELECTION                                     │
│     └── Znajdź dokumenty o podobnych tagach/tematyce        │
│         (semantic similarity > 0.7)                         │
│                                                             │
│  3. PAIRWISE COMPARISON                                     │
│     └── LLM porównuje pary dokumentów:                      │
│         "Czy te dokumenty są sprzeczne? Jeśli tak, opisz."  │
│                                                             │
│  4. CONFLICT REPORT                                         │
│     └── Lista potencjalnych konfliktów z opisem             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Model danych (draft)

```prisma
model ConflictReport {
  id            String   @id @default(uuid())
  workspaceId   String

  documentAId   String
  documentBId   String

  description   String   @db.Text
  severity      Severity // LOW | MEDIUM | HIGH
  status        Status   // PENDING | REVIEWED | RESOLVED | IGNORED

  createdAt     DateTime @default(now())
  reviewedAt    DateTime?
  reviewedBy    String?
}
```

### 9.4 Status

**Nie w MVP.** Do rozważenia w Fazie 2+.

---

## 10. MVP Scope

### Faza 1: Core (MVP) ✅

- [x] Setup monorepo (pnpm + turbo)
- [x] NestJS boilerplate z Swagger
- [x] Auth (register, login, JWT)
- [x] Prisma schema + pgvector setup (docker-compose)
- [x] Workspace CRUD + members
- [x] Document CRUD (tekst only)
- [x] Tags
- [x] Migracje Prisma
- [x] Seed z użytkownikiem testowym
- [ ] Testy jednostkowe
- [ ] Prosty frontend (React)

### Faza 2: File Upload + Chunking ✅

- [x] Backblaze B2 integration
- [x] File upload (PDF, DOCX, TXT, MD)
- [x] File parsers (pdf-parse, mammoth)
- [x] Smart chunking (LLM)
- [x] Hierarchical chunking for large files
- [ ] Background processing (Bull) - obecnie synchroniczne

### Faza 3: RAG Search ✅

- [x] OpenAI embeddings integration
- [x] pgvector similarity search
- [x] Search API
- [ ] Frontend search UI

### Faza 4: Public Access ✅

- [x] Public links CRUD
- [x] Public API endpoints
- [ ] Rate limiting

### Faza 5: Polish

- [ ] Audytor konfliktów (opcjonalnie)
- [ ] Better error handling
- [ ] Logging & monitoring
- [ ] Performance optimization
- [ ] Testy E2E

---

## 11. Następne kroki

### Zrealizowane
1. ✅ Zatwierdzić specyfikację
2. ✅ Setup monorepo (pnpm workspaces + turbo)
3. ✅ NestJS boilerplate z Swagger
4. ✅ Prisma schema
5. ✅ Auth (register, login, JWT)
6. ✅ Workspace CRUD + members
7. ✅ Document CRUD + file upload
8. ✅ Chunking service (smart + hierarchical)
9. ✅ Search API (pgvector similarity)
10. ✅ Public links + public API
11. ✅ Infrastructure: Backblaze B2, OpenAI embeddings, LLM

### Do zrobienia (priorytet)
1. ✅ Wygenerować migracje Prisma i uruchomić bazę
2. ✅ Utworzyć seed z użytkownikiem testowym
3. Napisać testy jednostkowe dla kluczowych serwisów
4. Stworzyć frontend React (`apps/web/`)
5. Dodać rate limiting dla public API
6. Background processing (Bull) dla dużych plików
