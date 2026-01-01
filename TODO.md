# TODO - Synjar Community

## Code Review Findings (2025-12-25)

Critical issues from frontend code review. Full details: `docs/specifications/2025-12-25-frontend-review-findings.md`

### CRITICAL (Before Production)

#### Security

- [x] **JWT token storage** - Access token in memory, refresh in localStorage, API client with Authorization header
  - Files: `apps/web/src/features/auth/model/authStore.ts`, `apps/web/src/shared/api/client.ts`

- [x] **Protected routes** - Dashboard requires authorization, redirect to /login for unauthenticated users
  - Files: `apps/web/src/app/router/ProtectedRoute.tsx`, `apps/web/src/App.tsx`

- [ ] **HTTPS enforcement** - Credentials sent as plain text, JWT can be intercepted (MITM)
  - Config: nginx.conf, vite.config.ts (plugin-basic-ssl for dev)

#### Testing

- [ ] **Zero tests** - Violation of TDD from CLAUDE.md. Add vitest.config.ts + tests for Login, Dashboard, Layout
  - Add: `apps/web/vitest.config.ts`, `apps/web/src/**/*.test.tsx`

#### Architecture

- [ ] **Anemic Architecture** - Business logic in components. Add application/ layer (use cases)
  - Add: `apps/web/src/application/auth/`, `apps/web/src/application/workspace/`

#### UX / Accessibility

- [ ] **Missing ARIA labels** - Forms and buttons without labels (WCAG 2.1 Level A failure)
  - Files: `apps/web/src/features/auth/Login.tsx`, `apps/web/src/features/dashboard/Dashboard.tsx`

### HIGH (Before Merge)

#### Security

- [ ] **CSP headers** - Missing Content Security Policy, vulnerable to XSS
  - Add: CSP meta tag in `apps/web/index.html` or header in nginx.conf

- [ ] **Client-side validation** - Only HTML5 required. Add React Hook Form + Zod
  - File: `apps/web/src/features/auth/Login.tsx`

- [ ] **Console.error leaks** - May expose sensitive info. Replace with proper logger
  - Files: `apps/web/src/shared/Layout.tsx`, `apps/web/src/features/dashboard/Dashboard.tsx`

#### Architecture

- [ ] **Layout SRP violation** - Mixes routing, presentation and API logic. Extract Navigation
  - File: `apps/web/src/shared/Layout.tsx`

- [ ] **Missing domain interfaces** - Plain interfaces instead of Value Objects, missing IWorkspaceRepository
  - Add: `apps/web/src/domain/workspace/`

#### UX

- [ ] **Dashboard error state** - API errors are not shown to user
  - File: `apps/web/src/features/dashboard/Dashboard.tsx`

- [ ] **Focus indicators** - Missing focus:ring for keyboard navigation (WCAG 2.1 Level AA)
  - Files: All interactive elements

- [ ] **WorkspaceCard keyboard** - Missing onClick/onKeyDown, inaccessible via TAB
  - File: `apps/web/src/features/dashboard/Dashboard.tsx`

#### Documentation

- [ ] **README.md** - Missing documentation for apps/web
  - Add: `apps/web/README.md`

### MEDIUM (Next Sprint)

- [ ] **Sourcemaps in production** - Disable in vite.config.ts
- [ ] **Security headers** - X-Frame-Options, X-Content-Type-Options in nginx
- [ ] **Hardcoded endpoints** - Magic strings, create src/config/api.ts
- [ ] **Style duplication** - Create shared Button component
- [ ] **ADR for stack** - Document choice of React 19, Vite 6, Tailwind 4
- [ ] **Active state in nav** - Missing visual indicator for active link

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
