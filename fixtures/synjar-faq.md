# Synjar FAQ

## General Questions

### What is Synjar?

Synjar is a self-hosted RAG (Retrieval Augmented Generation) backend. It provides a knowledge base that AI tools can query, giving them access to your documents, procedures, and verified information.

### Why would I use Synjar instead of just pasting context into ChatGPT?

Three main reasons:

1. **Consistency** - Update information once, all AI queries get the latest version
2. **Verification** - Mark sources as verified/unverified to control reliability
3. **Scale** - Handle thousands of documents that wouldn't fit in a prompt

### Is Synjar open source?

Yes, Synjar Community is open source under the Business Source License 1.1. It converts to Apache 2.0 on December 25, 2029. Commercial SaaS offerings require a license.

### What's the difference between Community and Enterprise?

| Feature | Community | Enterprise |
|---------|-----------|------------|
| Self-hosted | Yes | Yes + Cloud |
| Multi-workspace | Yes | Yes |
| Public links | Yes | Yes |
| SSO integration | No | Yes |
| Usage analytics | Basic | Advanced |
| Priority support | No | Yes |
| SLA | No | Yes |

## Technical Questions

### What database does Synjar use?

PostgreSQL with the pgvector extension for vector similarity search.

### Which embedding model is used?

OpenAI's `text-embedding-3-small` (1536 dimensions) by default. The architecture supports swapping embedding providers.

### How are documents chunked?

Synjar uses LLM-powered smart chunking that identifies semantic boundaries. For large documents, it falls back to hierarchical splitting based on document structure.

### Can I use a different embedding provider?

The architecture is designed for this, but currently only OpenAI is implemented. Contributions for other providers are welcome.

### What file formats are supported?

- PDF (.pdf)
- Microsoft Word (.docx)
- Markdown (.md)
- Plain text (.txt)

### How do I backup my data?

Standard PostgreSQL backup procedures apply:

```bash
pg_dump synjar > backup.sql
```

For file storage, backup your Backblaze B2 bucket or configured S3-compatible storage.

## Troubleshooting

### Search returns no results

1. Check if documents have finished processing (`processingStatus: COMPLETED`)
2. Verify the workspace ID is correct
3. Try broader queries or remove tag filters
4. Check if documents are VERIFIED (default search excludes unverified)

### Document upload fails

1. Check file size (default limit: 50 MB)
2. Verify file format is supported
3. Check storage quota hasn't been exceeded
4. Review API logs for specific error messages

### Embeddings are slow

1. OpenAI API latency varies; consider caching
2. Large documents take longer to process
3. Check if background processing is enabled

### Public link returns 403

1. Verify the token hasn't expired
2. Check if the link is still active (`isActive: true`)
3. Ensure requested tags are within `allowedTags` scope

## Contact

- **GitHub Issues:** https://github.com/thesynjar/synjar/issues
- **Documentation:** https://docs.synjar.com
- **Email:** support@synjar.com
