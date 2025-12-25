# Synjar Community

## Project

Self-hosted RAG backend. Knowledge base for AI with full data control.

- **Tasks:** `TODO.md` (MoSCoW prioritization)
- Specifications: `docs/specifications/`
- RAG Research: `research/RAG_Knowledge_Base_Research_2025.md`
- Archive (Frontdesk): `archive/frontdesk-2025-12-24/`

## Stack

- Backend: NestJS (TypeScript)
- ORM: Prisma
- Database: PostgreSQL + pgvector
- Embeddings: OpenAI text-embedding-3-small
- Frontend: React + Vite
- File Storage: Backblaze B2
- API Docs: Swagger/OpenAPI
- Container: Docker
- Monorepo: pnpm workspaces + turbo

## Engineering Principles

1. Always start by considering which set of agents/experts you need for the task.
2. Use: DDD, SOLID, DI, Clean Code, Clean Architecture.
3. Always write tests first (TDD). Stub > mock. Don't test implementation, test behavior.
4. All timestamps as `timestamp with time zone`.
5. Documentation: `docs/README.md`. Specifications: `docs/specifications/YYYY-MM-DD-subject.md`.

## Project Structure (Clean Architecture)

```
apps/
├── api/                      # NestJS Backend
│   └── src/
│       ├── domain/           # Entities, Value Objects, Interfaces
│       ├── application/      # Use Cases, Services
│       ├── infrastructure/   # Prisma, OpenAI, B2 adapters
│       └── interfaces/       # Controllers, DTOs
└── web/                      # React Frontend
    └── src/
        ├── features/         # Feature modules
        └── shared/           # Shared components
```

## Commits

Use conventional commits:
- `feat:` new feature
- `fix:` bug fix
- `refactor:` refactoring
- `test:` tests
- `docs:` documentation

## Related Repositories

- Enterprise: `../enterprise/` - synjar.com, paid features
- Docs: `https://docs.synjar.com`
