# Synjar Community

**Self-hosted RAG backend. Full control. Zero vendor lock-in.**

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)

---

## Quick Start (5 seconds)

```bash
# 1. Copy environment file
cp apps/api/.env.example apps/api/.env

# 2. Add your API keys to apps/api/.env:
#    - OPENAI_API_KEY (required)
#    - B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME (required)

# 3. Start everything
pnpm install
pnpm dev:full
```

**Done!** Open:
- Frontend: http://localhost:6210
- API: http://localhost:6200
- Emails: http://localhost:6203 (Mailpit)

See [QUICKSTART.md](QUICKSTART.md) for full development guide including dual-mode registration testing.

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

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- Backblaze B2 credentials ([sign up here](https://www.backblaze.com/b2/sign-up.html))

For detailed setup and testing instructions, see [QUICKSTART.md](QUICKSTART.md).

---

## Deployment

Synjar Community is designed for **self-hosted deployments**.

**Best for:** Single-tenant deployments, internal tools, maximum control

**Features:**
- First user becomes admin automatically (no email verification required)
- Public registration disabled after first user (invite-only)
- SMTP optional - works without email configuration
- Full data ownership and control
- No external service dependencies

**Configuration:**
```bash
# .env
DEPLOYMENT_MODE=self-hosted

# Optional: Set admin email for blocked registration messages
ADMIN_EMAIL=admin@yourcompany.com
```

**First User Setup:**
1. Deploy Synjar
2. Navigate to registration page
3. Create account - you're instantly admin (no email verification)
4. Invite team members via invitation system

> **Looking for SaaS/Cloud features?** See [Synjar Enterprise](https://synjar.com) for multi-tenant, billing, and managed deployments.

---

## API Examples

### Create Workspace

```bash
curl -X POST http://localhost:6200/workspaces \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "My Project"}'
```

### Upload Document

```bash
curl -X POST http://localhost:6200/workspaces/<workspaceId>/documents \
  -H "Authorization: Bearer <token>" \
  -F "file=@./docs/architecture.md"
```

### Semantic Search

```bash
curl -X POST http://localhost:6200/workspaces/<workspaceId>/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"query": "how to deploy"}'
```

### Create Public Link

```bash
curl -X POST http://localhost:6200/workspaces/<workspaceId>/public-links \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"expiresAt": "2025-12-31"}'
```

> **Full API documentation:** http://localhost:6200/api/docs (Swagger UI)

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
