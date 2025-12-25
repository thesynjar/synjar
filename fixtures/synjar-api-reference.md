# Synjar API Reference

## Base URL

```
http://localhost:6200/api/v1
```

## Authentication

All authenticated endpoints require a Bearer token:

```
Authorization: Bearer {your-jwt-token}
```

### Login

```http
POST /auth/login

{
  "email": "user@example.com",
  "password": "your-password"
}

Response:
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer"
}
```

### Register

```http
POST /auth/register

{
  "email": "user@example.com",
  "password": "SecureP@ssword123",
  "name": "John Doe"
}
```

## Workspaces

### List Workspaces

```http
GET /workspaces

Response:
{
  "data": [
    {
      "id": "ws_123",
      "name": "My Knowledge Base",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### Create Workspace

```http
POST /workspaces

{
  "name": "Product Documentation"
}
```

## Documents

### Create Document

```http
POST /workspaces/{workspaceId}/documents

{
  "title": "API Guide",
  "content": "# API Guide\n\nThis document explains...",
  "tags": ["api", "documentation"],
  "verificationStatus": "VERIFIED"
}
```

### Upload File

```http
POST /workspaces/{workspaceId}/documents
Content-Type: multipart/form-data

file: (binary)
tags: ["manual", "pdf"]
verificationStatus: "VERIFIED"
```

### List Documents

```http
GET /workspaces/{workspaceId}/documents?tags=api,faq&limit=20
```

## Search (RAG)

### Semantic Search

```http
POST /workspaces/{workspaceId}/search

{
  "query": "How do I configure authentication?",
  "tags": ["api", "security"],
  "limit": 5,
  "includeUnverified": false
}

Response:
{
  "results": [
    {
      "documentId": "doc_456",
      "chunkId": "chunk_789",
      "content": "Authentication is configured via...",
      "score": 0.92,
      "verificationStatus": "VERIFIED"
    }
  ]
}
```

## Public Links

### Create Public Link

```http
POST /workspaces/{workspaceId}/public-links

{
  "name": "Customer Support Bot",
  "allowedTags": ["faq", "troubleshooting"],
  "expiresAt": "2025-12-31T23:59:59Z"
}

Response:
{
  "id": "pl_123",
  "token": "abc123xyz",
  "url": "http://localhost:6200/api/v1/public/abc123xyz"
}
```

### Public Search (No Auth Required)

```http
POST /public/{token}/search

{
  "query": "What are your business hours?",
  "limit": 3
}
```

## Error Responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

Common status codes:
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (no access to resource)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
