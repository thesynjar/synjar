# TODO - Synjar Community

## Code Review Findings (2025-12-25)

Critical issues from frontend code review. Full details: `docs/specifications/2025-12-25-frontend-review-findings.md`

### CRITICAL (Before Production)

#### Security

- [x] **JWT token storage** - Access token w pamięci, refresh w localStorage, API client z Authorization header
  - Files: `apps/web/src/features/auth/model/authStore.ts`, `apps/web/src/shared/api/client.ts`

- [x] **Protected routes** - Dashboard wymaga autoryzacji, redirect na /login dla niezalogowanych
  - Files: `apps/web/src/app/router/ProtectedRoute.tsx`, `apps/web/src/App.tsx`

- [ ] **HTTPS enforcement** - Credentials przesyłane plain text, JWT może być przechwycony (MITM)
  - Config: nginx.conf, vite.config.ts (plugin-basic-ssl dla dev)

#### Testing

- [ ] **Zero testów** - Naruszenie TDD z CLAUDE.md. Dodaj vitest.config.ts + testy dla Login, Dashboard, Layout
  - Add: `apps/web/vitest.config.ts`, `apps/web/src/**/*.test.tsx`

#### Architecture

- [ ] **Anemic Architecture** - Logika biznesowa w komponentach. Dodać warstwę application/ (use cases)
  - Add: `apps/web/src/application/auth/`, `apps/web/src/application/workspace/`

#### UX / Accessibility

- [ ] **Brak ARIA labels** - Formularze i przyciski bez labels (WCAG 2.1 Level A failure)
  - Files: `apps/web/src/features/auth/Login.tsx`, `apps/web/src/features/dashboard/Dashboard.tsx`

### HIGH (Before Merge)

#### Security

- [ ] **CSP headers** - Brak Content Security Policy, podatność na XSS
  - Add: CSP meta tag w `apps/web/index.html` lub header w nginx.conf

- [ ] **Client-side validation** - Tylko HTML5 required. Dodać React Hook Form + Zod
  - File: `apps/web/src/features/auth/Login.tsx`

- [ ] **Console.error leaks** - Może ujawnić wrażliwe info. Zamień na proper logger
  - Files: `apps/web/src/shared/Layout.tsx`, `apps/web/src/features/dashboard/Dashboard.tsx`

#### Architecture

- [ ] **Layout SRP violation** - Miesza routing, prezentację i logikę API. Wydzielić Navigation
  - File: `apps/web/src/shared/Layout.tsx`

- [ ] **Brak domain interfaces** - Plain interfaces zamiast Value Objects, brak IWorkspaceRepository
  - Add: `apps/web/src/domain/workspace/`

#### UX

- [ ] **Dashboard error state** - Błędy API nie są pokazywane użytkownikowi
  - File: `apps/web/src/features/dashboard/Dashboard.tsx`

- [ ] **Focus indicators** - Brak focus:ring dla keyboard navigation (WCAG 2.1 Level AA)
  - Files: All interactive elements

- [ ] **WorkspaceCard keyboard** - Brak onClick/onKeyDown, niedostępny przez TAB
  - File: `apps/web/src/features/dashboard/Dashboard.tsx`

#### Documentation

- [ ] **README.md** - Brak dokumentacji dla apps/web
  - Add: `apps/web/README.md`

### MEDIUM (Next Sprint)

- [ ] **Sourcemaps w production** - Wyłączyć w vite.config.ts
- [ ] **Security headers** - X-Frame-Options, X-Content-Type-Options w nginx
- [ ] **Hardcoded endpoints** - Magic strings, utworzyć src/config/api.ts
- [ ] **Duplikacja stylów** - Utworzyć shared Button component
- [ ] **ADR dla stack** - Udokumentować wybór React 19, Vite 6, Tailwind 4
- [ ] **Active state w nav** - Brak wizualnego wskaźnika aktywnego linku

---

## How to Use This File

This file is the **single source of truth** for what we're doing and in what order.

### Rules

1. **Link specifications** - each task should link to detailed spec in `docs/specifications/`
2. **Keep it concise** - don't describe details here, that's what specs are for
3. **Update statuses** - `[ ]` todo, `[x]` done, `[~]` in progress
4. **Explain dependencies** - if something blocks another task, state it explicitly
5. **Backlog is loose ideas** - don't commit to them, they're inspiration

### MoSCoW

- **Must** - without this there's no MVP, we do it now
- **Should** - important for UX, we do it right after Must
- **Could** - nice to have, but MVP survives without it
- **Won't** - consciously deferred (doesn't mean "never")

---

## Must Have (P0) - MVP Foundation

### Backend

- [x] **Row Level Security** - [SPEC-001](docs/specifications/SPEC-001-row-level-security.md)
  - User data isolation at PostgreSQL level
  - **Status:** Done (26/26 tests, avg 0.93ms performance)

### Frontend

- [x] **Authentication** - [SPEC-011](docs/specifications/SPEC-011-frontend-auth.md)
  - Login, session, protected routes
  - **Status:** Done (JWT storage, AuthProvider, ProtectedRoute)
  - **Blocks:** Dashboard, Documents

- [~] **Dashboard** - [SPEC-012](docs/specifications/SPEC-012-frontend-dashboard.md)
  - Workspace list, navigation
  - **Status:** Basic UI done, needs error handling + tests
  - **Requires:** Auth
  - **Blocks:** Documents

- [ ] **Documents** - [SPEC-013](docs/specifications/SPEC-013-frontend-documents.md)
  - Document CRUD, file upload
  - **Requires:** Dashboard

---

## Should Have (P1) - Core Features

### Backend

- [ ] **Usage Tracking** - [SPEC-006](docs/specifications/SPEC-006-usage-tracking.md)
  - Count usage for limits (enterprise)

- [ ] **Fixed-size Chunking** - [SPEC-007](docs/specifications/SPEC-007-fixed-size-chunking.md)
  - Basic document splitting into chunks
  - **Blocks:** Strategy Selection

- [ ] **Chunking Strategy Selection** - [SPEC-008](docs/specifications/SPEC-008-chunking-strategy-selection.md)
  - Choose chunking strategy per document
  - **Requires:** Fixed-size Chunking

### Frontend

- [ ] **Markdown Editor** - [SPEC-014](docs/specifications/SPEC-014-frontend-markdown-editor.md)
  - Edit markdown documents in browser
  - **Requires:** Documents

- [ ] **Search** - [SPEC-015](docs/specifications/SPEC-015-frontend-search.md)
  - Semantic search interface
  - **Requires:** Documents

- [ ] **Public Links** - [SPEC-016](docs/specifications/SPEC-016-frontend-public-links.md)
  - Share knowledge base via link
  - **Requires:** Documents

---

## Could Have (P2) - Premium Features

- [ ] **Conflict Auditor** - [SPEC-009](docs/specifications/SPEC-009-conflict-auditor.md)
  - Detect contradictions in knowledge base
  - Premium feature

- [ ] **Verified Recommendations** - [SPEC-010](docs/specifications/SPEC-010-verified-recommendations.md)
  - Recommendations with reliability marking
  - **Requires:** Conflict Auditor
  - Premium feature

---

## Won't Have (for now)

- **Multi-tenant admin panel** - single admin per instance for now
- **Real-time collaboration** - documents edited by one person at a time
- **Mobile app** - responsive web is enough to start
- **Self-hosted installer** - Docker Compose is sufficient

---

## Backlog (loose ideas)

### MCP for LLMs (Memory Management)

> **Status:** Research complete - ready for specification
> **Research:** [LLM_Memory_Management_Research_2025.md](research/LLM_Memory_Management_Research_2025.md)

MCP (Model Context Protocol) server allowing LLMs (Claude, ChatGPT, Gemini) to manage Synjar knowledge base.

**MVP Tools (Phase 1):**
- [ ] `search_knowledge` - semantic search (RAG core)
- [ ] `get_document` - fetch full document
- [ ] `list_documents` - list with filtering
- [ ] `list_tags` - available tags
- [ ] `add_knowledge` - add new document (authenticated mode)

**Phase 2:**
- [ ] `update_document` - document update
- [ ] `delete_document` - deletion
- [ ] File upload via MCP
- [ ] Usage analytics, rate limiting

**Phase 3 (Enterprise):**
- [ ] Multi-workspace support in MCP
- [ ] Conflict detection (contradictions in knowledge)
- [ ] Audit logging
- [ ] Batch operations

**Architecture:**
- Separate application `apps/mcp-server/` (doesn't modify core API)
- Communication via existing REST API (Public + Authenticated)
- Transport: stdio (Claude Desktop) or HTTP/SSE (remote)
- SDK: `@modelcontextprotocol/sdk` (TypeScript)

**Key decisions:**
- Explicit > Magic (user sees what's in memory)
- Scoped contexts (workspace isolation)
- Metadata: verified/unverified, source, confidence, timestamps
- Default to VERIFIED results only (option includeUnverified)

---

Things that might be useful but aren't specifications yet:

- [ ] Import from Notion/Confluence
- [ ] Webhooks on knowledge base changes
- [ ] Slack/Discord integration for queries
- [ ] Bulk upload (ZIP with documents)
- [ ] Export knowledge base to PDF
- [ ] Document versioning (git-like)
- [ ] Document tags and categories
- [ ] Analytics dashboard (popular queries)
