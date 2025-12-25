# TODO - Synjar Community

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

- [ ] **Authentication** - [SPEC-011](docs/specifications/SPEC-011-frontend-auth.md)
  - Login, registration, session
  - **Blocks:** Dashboard, Documents

- [ ] **Dashboard** - [SPEC-012](docs/specifications/SPEC-012-frontend-dashboard.md)
  - Workspace list, navigation
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
