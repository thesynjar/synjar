# Getting Started with Synjar

## What is Synjar?

Synjar is a self-hosted RAG (Retrieval Augmented Generation) backend that gives your AI tools a persistent, verified knowledge base. Instead of copy-pasting the same context into every conversation, upload your documents once and let AI retrieve accurate answers automatically.

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/thesynjar/synjar.git
cd synjar/community
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials:
# - DATABASE_URL (PostgreSQL with pgvector)
# - OPENAI_API_KEY (for embeddings)
# - B2 credentials (for file storage)
```

### 3. Start the Database

```bash
pnpm docker:up      # Start PostgreSQL with pgvector
pnpm db:migrate     # Run database migrations
pnpm db:seed        # Create demo user and workspace
```

### 4. Start the API

```bash
pnpm dev
# API available at http://localhost:6200
# Swagger docs at http://localhost:6200/api/docs
```

## First Steps

1. **Create a workspace** - Workspaces isolate different knowledge bases
2. **Upload documents** - PDF, DOCX, TXT, or Markdown files
3. **Add tags** - Organize documents for filtered retrieval
4. **Create a public link** - Share your knowledge base via API
5. **Search semantically** - AI finds relevant content by meaning

## Example: Adding Your First Document

```bash
# Login to get a JWT token
curl -X POST http://localhost:6200/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@synjar.local", "password": "your-password"}'

# Create a document
curl -X POST http://localhost:6200/api/v1/workspaces/{workspaceId}/documents \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Company FAQ",
    "content": "Your knowledge content here...",
    "tags": ["faq", "getting-started"],
    "verificationStatus": "VERIFIED"
  }'
```

## Need Help?

- **Documentation:** https://docs.synjar.com
- **GitHub Issues:** https://github.com/thesynjar/synjar/issues
- **Email:** support@synjar.com
