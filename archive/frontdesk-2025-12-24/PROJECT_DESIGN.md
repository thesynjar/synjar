# Knowledge Base RAG - Projekt Systemu

## 1. Propozycje Nazwy

### Rekomendowana: **KnowledgeForge**

**Alternatywy:**
| Nazwa | Uzasadnienie |
|-------|-------------|
| **KnowledgeForge** | "Forge" = kuźnia, miejsce gdzie tworzy się wiedzę. Profesjonalne, branża-agnostyczne |
| **TruthBase** | Podkreśla weryfikację i źródło prawdy |
| **ChunkWise** | Nawiązuje do chunkingu, techniczne ale przyjazne |
| **MindVault** | "Vault" = skarbiec wiedzy, bezpieczeństwo |
| **InsightCore** | Core = rdzeń, Insight = wgląd, odpowiednie dla RAG |
| **WisdomLayer** | Layer = warstwa, pasuje do architektury RAG |

**Moja rekomendacja: KnowledgeForge**
- Uniwersalne dla różnych branż (hotelarstwo, medycyna, prawo, etc.)
- Kojarzy się z tworzeniem i uszlachetnianiem wiedzy
- Profesjonalne, ale nie nudne
- Dobre dla SaaS

---

## 2. Kluczowe Koncepcje

### 2.1 Dwa Tryby Wiedzy

```
┌─────────────────────────────────────────────────────────────────┐
│                      KNOWLEDGE TYPES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐          ┌─────────────────────┐       │
│  │   DRAFT KNOWLEDGE   │          │  VERIFIED KNOWLEDGE │       │
│  │   (Automatyczna)    │          │  (Źródło Prawdy)    │       │
│  ├─────────────────────┤          ├─────────────────────┤       │
│  │ • Auto-extracted    │          │ • Human verified    │       │
│  │ • LLM suggestions   │          │ • Approved by owner │       │
│  │ • Lower confidence  │   ──→    │ • High confidence   │       │
│  │ • Skippable         │ promote  │ • Priority in RAG   │       │
│  │ • Metadata tagged   │          │ • Source of truth   │       │
│  └─────────────────────┘          └─────────────────────┘       │
│                                                                  │
│  Status flow: draft → pending_review → verified → archived      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Workspace Isolation

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKSPACE ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Workspace: hotel_alpine_resort                                │
│   ├── Vector Store (isolated namespace)                         │
│   ├── Documents (isolated collection)                           │
│   ├── API Keys (scoped to workspace)                            │
│   └── Settings (custom chunking, prompts)                       │
│                                                                  │
│   Workspace: law_firm_xyz                                        │
│   ├── Vector Store (isolated namespace)                         │
│   ├── Documents (isolated collection)                           │
│   ├── API Keys (scoped to workspace)                            │
│   └── Settings (custom chunking, prompts)                       │
│                                                                  │
│   ZERO DATA LEAKAGE between workspaces                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Architektura Systemu

```
                              ┌──────────────────┐
                              │   LLM Consumer   │
                              │ (Frontdesk Bot)  │
                              └────────┬─────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                         API Gateway                               │
│  • Rate limiting    • Token validation    • Workspace routing    │
└──────────────────────────────────────────────────────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│  Ingestion API    │    │    Query API      │    │  Management API   │
│  POST /ingest     │    │  GET /search      │    │  CRUD documents   │
│  POST /bulk       │    │  POST /ask        │    │  Workspace mgmt   │
└─────────┬─────────┘    └─────────┬─────────┘    └─────────┬─────────┘
          │                        │                        │
          ▼                        ▼                        │
┌───────────────────┐    ┌───────────────────┐              │
│ Document Pipeline │    │  RAG Pipeline     │              │
│ • Parser          │    │  • Embedding      │              │
│ • Chunker         │    │  • Retrieval      │              │
│ • Embedder        │    │  • Reranking      │              │
│ • Metadata        │    │  • Filtering      │              │
│ • Auto-tagging    │    │  • Response       │              │
└─────────┬─────────┘    └─────────┬─────────┘              │
          │                        │                        │
          └────────────┬───────────┴────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Data Layer                                 │
├──────────────────────────┬───────────────────────────────────────┤
│  Vector Database         │  Relational Database                  │
│  (Qdrant/Milvus)         │  (PostgreSQL)                         │
│  • Embeddings            │  • Documents metadata                 │
│  • Namespace isolation   │  • Workspaces                         │
│  • Metadata filters      │  • Users & API keys                   │
│                          │  • Audit logs                         │
└──────────────────────────┴───────────────────────────────────────┘
```

---

## 4. API Design

### 4.1 Authentication & Authorization

**Token Types:**
1. **Master Token** - pełny dostęp do workspace (admin)
2. **Read Token** - tylko odczyt/query (dla LLM consumers)
3. **Write Token** - dodawanie treści (dla integracji)

**Token Format:**
```
kf_{workspace_id}_{type}_{random_32chars}

Przykłady:
kf_hotel_alpine_read_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
kf_hotel_alpine_write_x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4
kf_hotel_alpine_master_q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6
```

**URL Token (dla prostych integracji z LLM):**
```
GET /api/v1/query?token={url_token}&q={query}
```

---

### 4.2 Endpoints

#### 4.2.1 Workspaces

```yaml
# Tworzenie workspace
POST /api/v1/workspaces
Authorization: Bearer {master_token}
Content-Type: application/json

{
  "name": "Hotel Alpine Resort",
  "slug": "hotel-alpine-resort",
  "settings": {
    "default_language": "pl",
    "chunking_strategy": "semantic",
    "chunk_size": 512,
    "chunk_overlap": 50,
    "embedding_model": "sentence-transformers/all-mpnet-base-v2",
    "auto_extraction_prompt": "Extract key facts about hotel services, prices, and policies."
  }
}

# Response
{
  "id": "ws_abc123",
  "slug": "hotel-alpine-resort",
  "name": "Hotel Alpine Resort",
  "created_at": "2025-01-15T10:30:00Z",
  "api_keys": {
    "read": "kf_hotel-alpine-resort_read_...",
    "write": "kf_hotel-alpine-resort_write_...",
    "master": "kf_hotel-alpine-resort_master_..."
  },
  "_links": {
    "self": "/api/v1/workspaces/ws_abc123",
    "documents": "/api/v1/workspaces/ws_abc123/documents",
    "query": "/api/v1/workspaces/ws_abc123/query"
  }
}
```

---

#### 4.2.2 Document Ingestion

```yaml
# Tryb 1: Automatyczne wyciąganie (DRAFT)
POST /api/v1/workspaces/{workspace_id}/documents
Authorization: Bearer {write_token}
Content-Type: multipart/form-data

{
  "file": "<file_upload>",
  "mode": "auto_extract",  # draft knowledge
  "source_type": "email" | "chat" | "document" | "url" | "manual",
  "extraction_prompt": "Focus on room prices, availability, and guest policies",
  "metadata": {
    "source": "guest_email_2025-01-15",
    "category": "pricing",
    "tags": ["rooms", "pricing", "policies"]
  }
}

# Response (async job)
{
  "job_id": "job_xyz789",
  "status": "processing",
  "document_id": "doc_def456",
  "mode": "auto_extract",
  "knowledge_status": "draft",  # nie verified
  "_links": {
    "status": "/api/v1/jobs/job_xyz789",
    "document": "/api/v1/workspaces/ws_abc123/documents/doc_def456"
  }
}
```

```yaml
# Tryb 2: Zweryfikowana wiedza (VERIFIED)
POST /api/v1/workspaces/{workspace_id}/documents
Authorization: Bearer {write_token}
Content-Type: application/json

{
  "content": "Cena za pokój dwuosobowy wynosi 450 PLN za noc ze śniadaniem...",
  "mode": "verified",  # source of truth
  "title": "Cennik pokoi 2025",
  "metadata": {
    "category": "pricing",
    "tags": ["rooms", "pricing", "official"],
    "valid_from": "2025-01-01",
    "valid_until": "2025-12-31"
  },
  "verified_by": "jan.kowalski@hotel.pl"
}

# Response
{
  "document_id": "doc_ghi789",
  "status": "verified",
  "chunks_created": 3,
  "confidence": 1.0,  # max confidence dla verified
  "_links": {
    "self": "/api/v1/workspaces/ws_abc123/documents/doc_ghi789",
    "chunks": "/api/v1/workspaces/ws_abc123/documents/doc_ghi789/chunks"
  }
}
```

---

#### 4.2.3 Query / Search

```yaml
# Główny endpoint dla LLM (simple URL token)
GET /api/v1/query?token={url_token}&q={query}&format=json

# Przykład:
GET /api/v1/query?token=kf_hotel-alpine_read_abc123&q=ile%20kosztuje%20pokój%20dwuosobowy&format=json

# Response (JSON dla LLM)
{
  "query": "ile kosztuje pokój dwuosobowy",
  "results": [
    {
      "content": "Cena za pokój dwuosobowy wynosi 450 PLN za noc ze śniadaniem. W sezonie letnim (lipiec-sierpień) obowiązuje dopłata 50 PLN.",
      "confidence": 1.0,
      "source": "Cennik pokoi 2025",
      "knowledge_status": "verified",
      "metadata": {
        "valid_from": "2025-01-01",
        "valid_until": "2025-12-31"
      }
    },
    {
      "content": "Gość pytał o cenę pokoju i zaproponowaliśmy 400 PLN jako promocję dla stałych klientów.",
      "confidence": 0.7,
      "source": "Email: guest_jan@example.com",
      "knowledge_status": "draft",
      "metadata": {
        "category": "pricing",
        "extracted_at": "2025-01-10T15:30:00Z"
      }
    }
  ],
  "summary": "Standardowa cena za pokój dwuosobowy to 450 PLN/noc ze śniadaniem. W sezonie letnim dopłata 50 PLN.",
  "_meta": {
    "total_results": 2,
    "verified_count": 1,
    "draft_count": 1
  }
}
```

```yaml
# Zaawansowany endpoint (POST, więcej opcji)
POST /api/v1/workspaces/{workspace_id}/search
Authorization: Bearer {read_token}
Content-Type: application/json

{
  "query": "ile kosztuje pokój dwuosobowy",
  "filters": {
    "knowledge_status": ["verified"],  # tylko zweryfikowane
    "category": ["pricing", "rooms"],
    "tags": ["official"],
    "valid_at": "2025-07-15"  # czy wiedza jest aktualna
  },
  "options": {
    "top_k": 5,
    "include_drafts": false,  # pomiń draft knowledge
    "rerank": true,
    "generate_summary": true
  }
}

# Response
{
  "query": "ile kosztuje pokój dwuosobowy",
  "results": [...],
  "summary": "...",
  "confidence_score": 0.95,
  "_links": {
    "feedback": "/api/v1/workspaces/ws_abc123/feedback"
  }
}
```

---

#### 4.2.4 Knowledge Verification (Draft → Verified)

```yaml
# Lista draft knowledge do przeglądu
GET /api/v1/workspaces/{workspace_id}/documents?status=draft&needs_review=true
Authorization: Bearer {master_token}

# Response
{
  "documents": [
    {
      "id": "doc_draft_001",
      "extracted_content": "Gość prosił o rabat 10% na dłuższy pobyt",
      "source": "chat_log_2025-01-10",
      "extraction_confidence": 0.72,
      "suggested_category": "pricing",
      "suggested_tags": ["discount", "long_stay"],
      "created_at": "2025-01-10T15:30:00Z",
      "_links": {
        "verify": "/api/v1/workspaces/ws_abc123/documents/doc_draft_001/verify",
        "reject": "/api/v1/workspaces/ws_abc123/documents/doc_draft_001/reject",
        "edit": "/api/v1/workspaces/ws_abc123/documents/doc_draft_001"
      }
    }
  ],
  "total_pending": 15,
  "pagination": {...}
}
```

```yaml
# Weryfikacja draft → verified
POST /api/v1/workspaces/{workspace_id}/documents/{doc_id}/verify
Authorization: Bearer {master_token}
Content-Type: application/json

{
  "verified_content": "Oferujemy 10% rabatu przy pobycie dłuższym niż 7 nocy.",  # opcjonalna korekta
  "verified_by": "manager@hotel.pl",
  "notes": "Potwierdzone z polityką rabatową",
  "metadata_updates": {
    "category": "pricing",
    "tags": ["discount", "long_stay", "official"]
  }
}

# Response
{
  "document_id": "doc_draft_001",
  "previous_status": "draft",
  "new_status": "verified",
  "verified_at": "2025-01-15T11:00:00Z",
  "verified_by": "manager@hotel.pl"
}
```

```yaml
# Odrzucenie draft
POST /api/v1/workspaces/{workspace_id}/documents/{doc_id}/reject
Authorization: Bearer {master_token}
Content-Type: application/json

{
  "reason": "Informacja nieaktualna - ceny się zmieniły",
  "action": "archive" | "delete"  # archive zachowuje dla historii
}
```

---

#### 4.2.5 Bulk Operations

```yaml
# Bulk import wielu dokumentów
POST /api/v1/workspaces/{workspace_id}/documents/bulk
Authorization: Bearer {write_token}
Content-Type: application/json

{
  "documents": [
    {
      "content": "Śniadanie serwowane od 7:00 do 10:00",
      "mode": "verified",
      "category": "services"
    },
    {
      "content": "Parking hotelowy kosztuje 30 PLN/dzień",
      "mode": "verified",
      "category": "services"
    }
  ],
  "default_metadata": {
    "source": "official_info_2025",
    "tags": ["hotel_info"]
  }
}

# Response
{
  "job_id": "bulk_job_123",
  "total_documents": 2,
  "status": "processing",
  "_links": {
    "status": "/api/v1/jobs/bulk_job_123"
  }
}
```

---

#### 4.2.6 Webhooks & Callbacks

```yaml
# Konfiguracja webhooks
POST /api/v1/workspaces/{workspace_id}/webhooks
Authorization: Bearer {master_token}
Content-Type: application/json

{
  "url": "https://my-app.com/webhooks/knowledgeforge",
  "events": [
    "document.processed",
    "document.verified",
    "bulk.completed"
  ],
  "secret": "webhook_secret_key"
}

# Webhook payload example
{
  "event": "document.processed",
  "workspace_id": "ws_abc123",
  "document_id": "doc_def456",
  "status": "draft",
  "chunks_created": 5,
  "timestamp": "2025-01-15T10:35:00Z"
}
```

---

### 4.3 Response Formats

#### Standard JSON (dla API)
```json
{
  "query": "...",
  "results": [...],
  "summary": "...",
  "_meta": {...},
  "_links": {...}
}
```

#### Markdown (dla LLM context)
```
GET /api/v1/query?token={token}&q={query}&format=markdown
```
```markdown
# Query Results: ile kosztuje pokój dwuosobowy

## Verified Information (Source of Truth)

### Cennik pokoi 2025
Cena za pokój dwuosobowy wynosi 450 PLN za noc ze śniadaniem.
W sezonie letnim (lipiec-sierpień) obowiązuje dopłata 50 PLN.
- Valid: 2025-01-01 to 2025-12-31
- Confidence: 100%

## Draft Information (Unverified)

### Email: guest_jan@example.com (2025-01-10)
Gość pytał o cenę pokoju i zaproponowaliśmy 400 PLN jako promocję dla stałych klientów.
- Confidence: 70%
- Status: Pending review
```

#### Plain Text (dla prostych integracji)
```
GET /api/v1/query?token={token}&q={query}&format=text
```
```
Pokój dwuosobowy: 450 PLN/noc ze śniadaniem (sezon letni: +50 PLN).
Źródło: Cennik pokoi 2025 (zweryfikowane)
```

---

## 5. Workflows

### 5.1 Workflow: Automatyczne Wyciąganie Wiedzy

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Źródło     │     │   Parsowanie │     │   Chunking   │
│  (email,     │────▶│   (text,     │────▶│  (semantic,  │
│   chat,      │     │    tables,   │     │   512 tok)   │
│   dokument)  │     │    images)   │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Draft      │     │    Auto-     │     │  Embeddings  │
│  Knowledge   │◀────│    tagging   │◀────│  Generation  │
│   Created    │     │   (LLM)      │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Queue for  │     │   Human      │     │   Verified   │
│   Review     │────▶│   Review     │────▶│   Knowledge  │
│              │     │   (optional) │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 5.2 Workflow: Query z Priorytetami

```
┌──────────────┐
│  Zapytanie   │
│   od LLM     │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│           Embedding Query                         │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│           Vector Search (top-k * 2)              │
│  1. Najpierw szukaj w VERIFIED                   │
│  2. Potem szukaj w DRAFT (jeśli include_drafts)  │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│           Reranking + Scoring                    │
│  • Verified: base_score * 1.5 (boost)            │
│  • Draft: base_score * confidence                │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│           Format Response                         │
│  • Clearly mark verified vs draft                │
│  • Include confidence scores                      │
│  • Generate summary (optional)                   │
└──────────────────────────────────────────────────┘
```

### 5.3 Workflow: Verification Queue

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFICATION DASHBOARD                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Pending Review: 15 items                                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ #1 Email extraction (confidence: 72%)                    │   │
│  │ "Gość prosił o rabat 10% na dłuższy pobyt"              │   │
│  │ Source: chat_log_2025-01-10                              │   │
│  │                                                          │   │
│  │ [✓ Verify] [✏ Edit & Verify] [✗ Reject] [⏭ Skip]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ #2 Document extraction (confidence: 89%)                 │   │
│  │ "Check-out do godziny 11:00"                             │   │
│  │ Source: hotel_policy.pdf                                 │   │
│  │                                                          │   │
│  │ [✓ Verify] [✏ Edit & Verify] [✗ Reject] [⏭ Skip]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Models

### 6.1 PostgreSQL Schema

```sql
-- Workspaces
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash
    key_prefix VARCHAR(20) NOT NULL,  -- dla identyfikacji: kf_hotel_read_
    type VARCHAR(20) NOT NULL,  -- read, write, master
    name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(500),
    content TEXT,
    content_hash VARCHAR(64),  -- dla deduplikacji
    source_type VARCHAR(50),  -- email, chat, document, url, manual
    source_reference VARCHAR(500),  -- original filename, URL, etc.
    knowledge_status VARCHAR(20) DEFAULT 'draft',  -- draft, pending_review, verified, rejected, archived
    confidence FLOAT DEFAULT 0.5,
    extraction_prompt TEXT,  -- prompt użyty do ekstrakcji
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    verified_at TIMESTAMP,
    verified_by VARCHAR(255)
);

-- Chunks (dla granularnej kontroli)
CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    embedding_id VARCHAR(100),  -- ID w vector DB
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Verification History
CREATE TABLE verification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL,  -- verified, rejected, edited
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    previous_content TEXT,
    new_content TEXT,
    notes TEXT,
    performed_by VARCHAR(255),
    performed_at TIMESTAMP DEFAULT NOW()
);

-- Query Logs (dla analytics i feedback)
CREATE TABLE query_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    results_count INTEGER,
    verified_results_count INTEGER,
    draft_results_count INTEGER,
    response_time_ms INTEGER,
    api_key_prefix VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_workspace_status ON documents(workspace_id, knowledge_status);
CREATE INDEX idx_documents_workspace_category ON documents(workspace_id, (metadata->>'category'));
CREATE INDEX idx_chunks_workspace ON chunks(workspace_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

### 6.2 Vector Database Schema (Qdrant)

```json
{
  "collection_name": "workspace_{workspace_id}",
  "vectors": {
    "size": 768,
    "distance": "Cosine"
  },
  "payload_schema": {
    "document_id": "keyword",
    "chunk_id": "keyword",
    "chunk_index": "integer",
    "knowledge_status": "keyword",
    "confidence": "float",
    "category": "keyword",
    "tags": "keyword[]",
    "source_type": "keyword",
    "valid_from": "datetime",
    "valid_until": "datetime",
    "created_at": "datetime",
    "content_preview": "text"
  }
}
```

---

## 7. Tech Stack Rekomendacja

### Backend (MVP)
```
Framework:      FastAPI (Python 3.11+)
Vector DB:      Qdrant (self-hosted, 1GB free cloud)
Relational DB:  PostgreSQL 15+
Embeddings:     sentence-transformers/all-mpnet-base-v2
Chunking:       LangChain RecursiveCharacterTextSplitter
                (potem semantic chunking)
Document Parse: Unstructured.io (opensource)
Queue:          Redis + Celery (async processing)
Cache:          Redis
Auth:           JWT + API Keys
```

### Backend (Production)
```
Framework:      FastAPI + Haystack pipelines
Vector DB:      Milvus (self-hosted) lub Qdrant
Relational DB:  PostgreSQL 15+ (z RLS)
Embeddings:     Hybrid: all-mpnet-base-v2 + OpenAI fallback
Chunking:       Semantic (LlamaIndex/LangChain)
Document Parse: LlamaParse + Docling (hybrid)
Queue:          Redis + Celery
Cache:          Redis Cluster
Auth:           JWT + API Keys + OAuth2
Monitoring:     LangSmith + RAGAS + Prometheus
```

### Infrastructure
```
Container:      Docker + docker-compose (dev)
Orchestration:  Kubernetes (prod)
CI/CD:          GitHub Actions
IaC:            Terraform
Cloud:          AWS / GCP / Hetzner
```

---

## 8. Roadmap

### Faza 1: MVP (4-6 tygodni)
- [ ] Basic API (workspaces, documents, query)
- [ ] Qdrant integration
- [ ] Simple chunking (fixed size)
- [ ] Draft vs Verified status
- [ ] URL token access
- [ ] JSON/text response formats

### Faza 2: Core Features (4-6 tygodni)
- [ ] Semantic chunking
- [ ] Auto-tagging (LLM)
- [ ] Verification workflow
- [ ] Webhooks
- [ ] Bulk import
- [ ] Query analytics

### Faza 3: Production (4-6 tygodni)
- [ ] Multi-parser support
- [ ] Reranking
- [ ] Advanced filtering
- [ ] Rate limiting
- [ ] Monitoring (LangSmith)
- [ ] RAGAS evaluation

### Faza 4: Frontend (4-6 tygodni)
- [ ] Admin dashboard
- [ ] Document management UI
- [ ] Verification queue UI
- [ ] Analytics dashboard
- [ ] API key management

### Faza 5: Enterprise (ongoing)
- [ ] GraphRAG
- [ ] Agentic workflows
- [ ] SSO integration
- [ ] Audit logs export
- [ ] White-label

---

## 9. Gotowe Rozwiązania do Rozważenia

Zamiast budować od zera, warto rozważyć:

### 9.1 RAGFlow (polecany)
- **Pros:** Deep document understanding, GraphRAG, REST API
- **Cons:** Bardziej complex setup
- **Fit:** Wysoki - ma już większość potrzebnych features

### 9.2 Dify
- **Pros:** Visual workflow, enterprise ready, Backend-as-Service
- **Cons:** Licencja Apache 2.0 z restrictions dla SaaS
- **Fit:** Średni - trzeba sprawdzić licencję

### 9.3 AnythingLLM
- **Pros:** Multi-user, RBAC, MCP support, MIT license
- **Cons:** Młodszy projekt
- **Fit:** Średni - dobry dla privacy-focused

### Rekomendacja:
1. **Szybki start:** Fork RAGFlow + customization
2. **Pełna kontrola:** Build custom na FastAPI + Haystack

---

## 10. Przykładowe Integracje

### 10.1 Z Frontdesk Botem

```python
# W bocie frontdesk
import requests

KNOWLEDGE_API = "https://api.knowledgeforge.io/v1/query"
TOKEN = "kf_hotel-alpine_read_abc123..."

def get_knowledge(user_question: str) -> str:
    """Pobierz wiedzę z KnowledgeForge"""
    response = requests.get(
        KNOWLEDGE_API,
        params={
            "token": TOKEN,
            "q": user_question,
            "format": "markdown",
            "include_drafts": "false"  # tylko verified
        }
    )
    return response.text

# Użycie w promcie
user_question = "Ile kosztuje parking?"
knowledge = get_knowledge(user_question)

prompt = f"""
Jesteś asystentem hotelowym. Odpowiedz na pytanie gościa.

BAZA WIEDZY:
{knowledge}

PYTANIE GOŚCIA:
{user_question}

Odpowiedź:
"""
```

### 10.2 Automatyczne Dodawanie z Emaili

```python
# Webhook handler
from fastapi import FastAPI, Request

@app.post("/webhooks/email")
async def process_email(request: Request):
    email_data = await request.json()

    # Wyślij do KnowledgeForge jako draft
    response = requests.post(
        f"{KNOWLEDGE_API}/workspaces/{WORKSPACE_ID}/documents",
        headers={"Authorization": f"Bearer {WRITE_TOKEN}"},
        json={
            "content": email_data["body"],
            "mode": "auto_extract",
            "source_type": "email",
            "extraction_prompt": "Extract guest requests, preferences, and any pricing discussions",
            "metadata": {
                "source": f"email_{email_data['from']}",
                "subject": email_data["subject"],
                "date": email_data["date"]
            }
        }
    )
    return {"status": "queued", "job_id": response.json()["job_id"]}
```

---

## Podsumowanie

**Nazwa:** KnowledgeForge

**Kluczowe Features:**
1. Dwa tryby wiedzy: Draft (auto) vs Verified (source of truth)
2. Workspace isolation (multi-tenant)
3. Simple URL token access dla LLM
4. Workflow weryfikacji draft → verified
5. Flexible response formats (JSON, Markdown, Text)

**Tech Stack MVP:**
- FastAPI + Qdrant + PostgreSQL + Redis
- sentence-transformers + Unstructured.io

**Następne Kroki:**
1. Zatwierdzić nazwę
2. Zatwierdzić API design
3. Setup repozytorium
4. MVP w 4-6 tygodni
