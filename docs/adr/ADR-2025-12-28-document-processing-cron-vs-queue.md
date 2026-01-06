# ADR-2025-12-28: Document Processing - Cron vs Message Queue

## Status

**Accepted**

## Context

After adding documents to a workspace (e.g., through seed or upload), documents have `PENDING` status and require processing (chunking, embedding generation). We need an automatic processing mechanism.

### Requirements

1. **Automatic processing** - PENDING documents must be processed without user intervention
2. **Multi-instance safety** - in Cloud (Kubernetes) there may be multiple API instances
3. **Tenant isolation** - each workspace must be isolated (RLS)
4. **Fault tolerance** - failure of one document must not block others
5. **Configurable** - interval, batch size, timeout must be configurable

### Options Considered

#### Option A: Simple Cron Job (@nestjs/schedule)

**Description:** Scheduler runs every N seconds, checks for PENDING documents, processes batch.

**Pros:**
- Simple implementation (~100 LOC)
- Zero additional dependencies (schedule + PostgreSQL advisory locks)
- Easy debugging (synchronous flow)
- Works out-of-the-box in development

**Cons:**
- Polling (checks even when no documents)
- Less efficient for high volume (>1000 docs/day)
- No prioritization

#### Option B: Message Queue (BullMQ + Redis)

**Description:** Each upload emits event, worker processes from queue.

**Pros:**
- Event-driven (processes only when there are documents)
- Built-in retry with backoff
- Prioritization possible
- Better for high volume

**Cons:**
- Additional dependency (Redis)
- More code (~300 LOC + job processors)
- Operational complexity (Redis monitoring, failover)
- Overengineering for <100 docs/day

#### Option C: Database Queue (pg-boss)

**Description:** Queue implemented in PostgreSQL.

**Pros:**
- Zero additional dependencies (only PostgreSQL)
- ACID guarantees
- Event-driven

**Cons:**
- Less popular (smaller community)
- Polling inside (hidden)
- PostgreSQL load at high volume

## Decision

**We choose Option A: Simple Cron Job** with the following improvements:

1. **PostgreSQL Advisory Locks** - distributed locking without Redis
2. **Per-workspace processing** - tenant isolation through RLS
3. **Configurable parameters** - env vars for interval/batch/timeout

### Justification

1. **Simplicity wins** - project is in early phase, <100 docs/day expected
2. **Zero new dependencies** - we already have PostgreSQL, we don't need Redis
3. **Easy to evolve** - if volume grows, migration to BullMQ is simple (scheduler → job producer)

### Migration path to BullMQ (future)

If volume exceeds 1000 docs/day or prioritization is needed:

```typescript
// Current: Scheduler finds PENDING docs and processes
@Cron(...)
async processPendingDocuments() {
  const docs = await findPendingDocs();
  for (const doc of docs) {
    await this.processDocument(doc.id);
  }
}

// Future: Upload emits event, scheduler becomes job producer
async onDocumentCreated(event: DocumentCreatedEvent) {
  await this.documentQueue.add('process', { documentId: event.documentId });
}

@Processor('document')
async processJob(job: Job) {
  await this.processDocument(job.data.documentId);
}
```

## Consequences

### Positive

- Simple implementation and maintenance
- No additional dependencies (Redis)
- Works in development without setup
- PostgreSQL advisory locks ensure multi-instance safety

### Negative

- Polling overhead (every 10s query even when no documents)
- No built-in retry with exponential backoff (manual implementation)
- Less efficient for high volume

### Risks

| Risk | Mitigation |
|------|------------|
| High volume exceeds capacity | Monitor processing lag, migrate to BullMQ when needed |
| Polling overhead | Advisory lock query is cheap (<1ms), acceptable |

## Related

- [SPEC: Document Processing Scheduler](../specifications/2025-12-28-document-processing-scheduler.md)
- [ADR-2025-12-26: Background Email Queue](./ADR-2025-12-26-background-email-queue.md) - uses similar pattern for emails

## Notes

Email queue uses BullMQ because:
1. Emails can be delayed (scheduled sending)
2. Email failures require retry with backoff
3. Volume can be higher (notifications, etc.)

Document processing uses cron because:
1. No scheduled processing (ASAP)
2. Retry = next cron cycle (simple)
3. Volume predictably low (<100/day)
