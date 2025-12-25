# Synjar Features

## Core Features

### Smart Chunking

Synjar uses LLM-powered document splitting to create semantically coherent chunks. Unlike fixed-size chunking that cuts text at arbitrary points, smart chunking:

- Preserves complete thoughts and paragraphs
- Maintains context within each chunk
- Identifies section boundaries automatically
- Optimizes for RAG retrieval accuracy

### Semantic Search

Find documents by meaning, not just keywords:

- **Vector embeddings** - Documents are converted to high-dimensional vectors
- **Similarity matching** - Search finds conceptually related content
- **Configurable threshold** - Adjust relevance sensitivity
- **Tag filtering** - Narrow results to specific categories

Example: Searching for "refund policy" will match documents about "return procedures" even without exact keyword matches.

### Multi-Workspace

Isolate different knowledge bases for different purposes:

- **Team workspaces** - Separate knowledge for different departments
- **Client workspaces** - Multi-tenant SaaS use case
- **Project workspaces** - Version control for different product lines
- **Complete isolation** - Data never crosses workspace boundaries

### Verified Sources

Control what AI treats as authoritative:

- **VERIFIED** - Human-approved, authoritative content
- **UNVERIFIED** - Drafts, AI-generated, or unreviewed content
- **Filter by status** - API supports `includeUnverified` flag
- **Visual indicators** - UI clearly marks source reliability

### Public Links

Share knowledge without exposing credentials:

- **Token-based access** - Unique URL for each integration
- **Tag scoping** - Limit what documents are accessible
- **Expiration dates** - Automatic link invalidation
- **Usage tracking** - Monitor who queries what

## File Support

Synjar processes these file formats:

| Format | Extension | Notes |
|--------|-----------|-------|
| PDF | .pdf | Text extraction, preserves structure |
| Word | .docx | Full formatting support |
| Markdown | .md | Native support, syntax preserved |
| Plain text | .txt | As-is processing |

## Integration Options

### REST API

Full-featured API with Swagger documentation:

```
GET  /api/docs      - Interactive API explorer
GET  /api/docs-json - OpenAPI 3.0 specification
```

### MCP Server (Coming Soon)

Model Context Protocol support for direct LLM integration:

- Claude Desktop integration
- ChatGPT plugin compatibility
- Gemini API support

### Public API

Unauthenticated endpoint for chatbot integrations:

```
POST /public/{token}/search
```

## Limits (Self-Hosted)

Default limits for self-hosted installations:

| Resource | Default | Configurable |
|----------|---------|--------------|
| Max file size | 50 MB | Yes |
| Storage per workspace | 1 GB | Yes |
| Documents per workspace | 1000 | Yes |
| Workspaces per user | 10 | Yes |

All limits can be adjusted via environment variables.
