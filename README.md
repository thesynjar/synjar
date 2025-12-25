# Synjar Community

**Self-hosted RAG backend. Full control. Zero vendor lock-in.**

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)

---

## Why Synjar?

You're building AI apps. You need retrieval. You don't want:
- **Pinecone bills** that scale faster than your revenue
- **LangChain complexity** when you just need a working backend
- **Vendor lock-in** with proprietary APIs

Synjar gives you a **production-ready RAG backend** you deploy once and own forever.

```bash
docker compose up -d && curl http://localhost:6200/health
# Done. You have RAG.
```

---

## Features

| Feature | What it means for you |
|---------|----------------------|
| **Smart chunking** | LLM-powered document splitting at semantic boundaries - no mid-sentence fragments |
| **Semantic search** | pgvector similarity search, not keyword matching |
| **Multi-workspace** | Isolate tenants, clients, or projects. Each gets separate vector space |
| **Public links** | Share knowledge via URL. No API keys for consumers. Set scope and expiry |
| **Verified sources** | Mark trusted vs untrusted content. Control what AI treats as ground truth |
| **File upload** | PDF, DOCX, TXT, MD out of the box. Extensible for more |

---

## Security

### Row Level Security (RLS)

Synjar implements **PostgreSQL Row Level Security** for defense-in-depth data isolation:

- **Database-level enforcement** - Even application bugs cannot leak data between workspaces
- **Automatic filtering** - All queries are filtered by user's workspace membership
- **Zero trust architecture** - Security doesn't rely solely on application code

```
User A ──► API ──► RLS Policy ──► Only User A's data
User B ──► API ──► RLS Policy ──► Only User B's data
```

**Performance impact:** Average operation time ~0.9ms with RLS (< 2ms for all operations).

### How it works

1. Each request sets the user context in the database session
2. RLS policies automatically filter all queries
3. Users can only see workspaces they're members of
4. Documents, chunks, and public links inherit workspace isolation

For implementation details, see [SPEC-001: Row Level Security](docs/specifications/SPEC-001-row-level-security.md).

---

## Tech Stack

```
┌─────────────────────────────────────────────────────────┐
│                      Synjar API                         │
├─────────────────────────────────────────────────────────┤
│  NestJS (TypeScript)  │  Clean Architecture  │  DDD    │
├─────────────────────────────────────────────────────────┤
│  Prisma ORM           │  PostgreSQL + pgvector         │
├─────────────────────────────────────────────────────────┤
│  OpenAI embeddings    │  Backblaze B2 storage          │
└─────────────────────────────────────────────────────────┘
```

| Layer | Technology |
|-------|------------|
| Backend | NestJS (TypeScript) |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma |
| Embeddings | OpenAI text-embedding-3-small |
| File Storage | Backblaze B2 (S3-compatible) |
| API Docs | Swagger/OpenAPI |
| Monorepo | pnpm workspaces + Turborepo |

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- OpenAI API key
- Backblaze B2 credentials (or any S3-compatible storage)

### 10-Minute Setup

```bash
# Clone
git clone https://github.com/thesynjar/synjar.git
cd synjar

# Install
pnpm install

# Configure
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env: add OPENAI_API_KEY, B2 credentials

# Start
pnpm docker:up      # PostgreSQL + pgvector
pnpm db:migrate     # Run migrations
pnpm dev            # API at localhost:6200
```

### Verify It Works

```bash
# Health check
curl http://localhost:6200/health

# Swagger UI
open http://localhost:6200/api/docs
```

---

## API Examples

### Create Workspace

```bash
curl -X POST http://localhost:6200/api/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project"}'
```

### Upload Document

```bash
curl -X POST http://localhost:6200/api/documents \
  -F "file=@./docs/architecture.md" \
  -F "workspaceId=ws_123"
```

### Semantic Search

```bash
curl "http://localhost:6200/api/search?q=how%20to%20deploy&workspaceId=ws_123"
```

### Create Public Link

```bash
curl -X POST http://localhost:6200/api/public-links \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "ws_123", "expiresAt": "2025-12-31"}'
```

---

## Project Structure

```
synjar/
├── apps/
│   ├── api/                 # NestJS Backend
│   │   └── src/
│   │       ├── domain/      # Entities, Value Objects, Ports
│   │       ├── application/ # Use Cases, Services
│   │       ├── infrastructure/ # Prisma, OpenAI, B2 adapters
│   │       └── interfaces/  # Controllers, DTOs
│   └── web/                 # React Frontend (planned)
├── prisma/                  # Database schema
├── docs/
│   ├── specifications/      # Feature specs
│   ├── adr/                 # Architecture Decision Records
│   └── security/            # Security guidelines
└── docker-compose.yml
```

---

## Development

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:cov

# Linting
pnpm lint

# Build
pnpm build

# Database studio
pnpm db:studio
```

---

## vs Alternatives

| Feature | Synjar | Dify | Quivr | Pinecone |
|---------|--------|------|-------|----------|
| **Self-hosted** | Yes | Yes | Yes | No |
| **API-first** | Yes | Partial | Limited | Yes |
| **Multi-tenant** | Yes | Yes | Limited | No |
| **Public links** | Yes | No | No | No |
| **Verified sources** | Yes | No | No | No |
| **Pricing** | Free (self-hosted) | Free tier | Free tier | $70+/mo |

**When to use Synjar:**
- You're building a product with RAG
- You need multi-tenant isolation
- You want to own your infrastructure
- You prefer API over chat interface

**When to use alternatives:**
- You want a no-code AI app builder → Dify
- You want personal note-taking → Quivr/Mem.ai
- You need managed vector DB only → Pinecone

---

## Documentation

- [API Specification](docs/specifications/)
- [Architecture Decision Records](docs/adr/)
- [Security Guidelines](docs/security/)

---

## Contributing

We welcome contributions from developers who value clean code and good architecture.

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

---

## License

[Business Source License 1.1](LICENSE)

- Source code is open and available
- Free for internal, educational, and development use
- Commercial SaaS offerings require a license
- Converts to Apache 2.0 on December 25, 2029

**Commercial licensing:** michal@kukla.tech

---

## Related

- [Synjar Enterprise](https://synjar.com) - Managed SaaS with support, SSO, analytics
- [Documentation](https://docs.synjar.com) - Full API reference
