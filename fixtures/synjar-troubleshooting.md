# Synjar Troubleshooting Guide

## Common Issues

### Database Connection Failed

**Symptoms:**
- API won't start
- Error: `Connection refused` or `ECONNREFUSED`

**Solutions:**

1. **Check if PostgreSQL is running:**
   ```bash
   pnpm docker:up
   docker ps | grep postgres
   ```

2. **Verify connection string:**
   ```bash
   # Check .env file
   DATABASE_URL="postgresql://postgres:postgres@localhost:6201/synjar?schema=public"
   ```

3. **Check if pgvector extension is enabled:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. **Run migrations:**
   ```bash
   pnpm db:migrate
   ```

---

### Document Processing Stuck

**Symptoms:**
- Documents stay in `PENDING` or `PROCESSING` status
- No chunks are created

**Solutions:**

1. **Check OpenAI API key:**
   ```bash
   # Verify key is set in .env
   OPENAI_API_KEY="sk-proj-..."
   ```

2. **Check OpenAI rate limits:**
   - Review API usage at platform.openai.com
   - Implement exponential backoff

3. **Check document content:**
   - Empty files won't generate chunks
   - Binary files (images in PDFs) may fail extraction

4. **Review API logs:**
   ```bash
   pnpm dev  # Watch console output
   ```

---

### Search Returns Empty Results

**Symptoms:**
- Search query returns `{ "results": [] }`
- Known documents not appearing

**Solutions:**

1. **Verify processing completed:**
   ```bash
   curl http://localhost:6200/api/v1/workspaces/{id}/documents/{docId}
   # Check: "processingStatus": "COMPLETED"
   ```

2. **Check verification filter:**
   ```json
   // Default excludes unverified
   { "includeUnverified": true }
   ```

3. **Remove tag filters to broaden search:**
   ```json
   { "query": "your search", "tags": [] }
   ```

4. **Check if chunks exist:**
   ```sql
   SELECT COUNT(*) FROM "Chunk" WHERE "documentId" = 'your-doc-id';
   ```

---

### Authentication Errors

**Symptoms:**
- `401 Unauthorized` on all requests
- Token rejected

**Solutions:**

1. **Check JWT_SECRET matches:**
   - Same secret must be used to sign and verify
   - Don't change it after issuing tokens

2. **Check token expiration:**
   - Default: 7 days (`JWT_EXPIRES_IN`)
   - Re-login if expired

3. **Verify header format:**
   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
   ```

---

### File Upload Fails

**Symptoms:**
- `413 Payload Too Large`
- `400 Bad Request` on file upload

**Solutions:**

1. **Check file size limit:**
   ```bash
   # .env
   MAX_FILE_SIZE_MB=50
   ```

2. **Verify file format:**
   - Supported: PDF, DOCX, MD, TXT
   - Check MIME type is correct

3. **Check storage quota:**
   ```sql
   SELECT SUM("fileSize") FROM "Document" WHERE "workspaceId" = 'your-ws';
   ```

4. **Verify B2/S3 credentials:**
   ```bash
   B2_KEY_ID="..."
   B2_APPLICATION_KEY="..."
   B2_BUCKET_NAME="..."
   ```

---

### Public Link Not Working

**Symptoms:**
- `404 Not Found` on public endpoint
- `403 Forbidden` with valid token

**Solutions:**

1. **Check token is valid:**
   ```bash
   curl http://localhost:6200/api/v1/public/{token}
   ```

2. **Verify link is active:**
   ```sql
   SELECT "isActive", "expiresAt" FROM "PublicLink" WHERE "token" = '...';
   ```

3. **Check tag scope:**
   - Requested tags must be in `allowedTags`
   - Empty `allowedTags` means all tags allowed

---

## Diagnostic Commands

### Check System Health

```bash
curl http://localhost:6200/health
```

### View Database Status

```bash
pnpm db:studio  # Opens Prisma Studio
```

### Check API Logs

```bash
pnpm dev 2>&1 | tee api.log
```

### Reset Database

```bash
pnpm db:push --force-reset
pnpm db:seed
```

## Getting Help

If these solutions don't resolve your issue:

1. **Search existing issues:** https://github.com/thesynjar/synjar/issues
2. **Open a new issue** with:
   - Error message
   - Steps to reproduce
   - Environment details (OS, Node version, Docker version)
3. **Contact support:** support@synjar.com
