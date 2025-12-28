# ADR-2025-12-28: Document Processing - Cron vs Message Queue

## Status

**Accepted**

## Context

Po dodaniu dokumentów do workspace (np. przez seed lub upload), dokumenty mają status `PENDING` i wymagają przetworzenia (chunking, embedding generation). Potrzebujemy mechanizmu automatycznego przetwarzania.

### Wymagania

1. **Automatyczne przetwarzanie** - dokumenty PENDING muszą być przetwarzane bez interwencji użytkownika
2. **Multi-instance safety** - w Cloud (Kubernetes) może być wiele instancji API
3. **Tenant isolation** - każdy workspace musi być izolowany (RLS)
4. **Fault tolerance** - błąd jednego dokumentu nie może blokować innych
5. **Configurable** - interval, batch size, timeout muszą być konfigurowalne

### Opcje rozważone

#### Option A: Simple Cron Job (@nestjs/schedule)

**Opis:** Scheduler uruchamia się co N sekund, sprawdza dokumenty PENDING, przetwarza batch.

**Pros:**
- Prosta implementacja (~100 LOC)
- Zero dodatkowych dependencies (schedule + PostgreSQL advisory locks)
- Łatwe debugowanie (synchronous flow)
- Działa out-of-the-box w development

**Cons:**
- Polling (sprawdza nawet gdy brak dokumentów)
- Mniej efektywne dla high volume (>1000 docs/day)
- Brak priorytetyzacji

#### Option B: Message Queue (BullMQ + Redis)

**Opis:** Każdy upload emituje event, worker przetwarza z kolejki.

**Pros:**
- Event-driven (przetwarza tylko gdy są dokumenty)
- Wbudowany retry z backoff
- Priorytetyzacja możliwa
- Lepsze dla high volume

**Cons:**
- Dodatkowa dependency (Redis)
- Więcej kodu (~300 LOC + job processors)
- Złożoność operacyjna (Redis monitoring, failover)
- Overengineering dla <100 docs/day

#### Option C: Database Queue (pg-boss)

**Opis:** Queue zaimplementowany w PostgreSQL.

**Pros:**
- Zero dodatkowych dependencies (tylko PostgreSQL)
- ACID guarantees
- Event-driven

**Cons:**
- Mniej popularny (mniejsze community)
- Polling wewnątrz (ukryte)
- PostgreSQL load przy high volume

## Decision

**Wybieramy Option A: Simple Cron Job** z następującymi ulepszeniami:

1. **PostgreSQL Advisory Locks** - distributed locking bez Redis
2. **Per-workspace processing** - tenant isolation przez RLS
3. **Configurable parameters** - env vars dla interval/batch/timeout

### Uzasadnienie

1. **Simplicity wins** - projekt jest we wczesnej fazie, <100 docs/day expected
2. **Zero new dependencies** - PostgreSQL już mamy, nie potrzebujemy Redis
3. **Easy to evolve** - jeśli volume wzrośnie, migracja do BullMQ jest prosta (scheduler → job producer)

### Migration path to BullMQ (future)

Jeśli volume przekroczy 1000 docs/day lub potrzebna będzie priorytetyzacja:

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

- Prosta implementacja i maintenance
- Brak dodatkowych dependencies (Redis)
- Działa w development bez setup
- PostgreSQL advisory locks zapewniają multi-instance safety

### Negative

- Polling overhead (co 10s query nawet gdy brak dokumentów)
- Brak wbudowanego retry z exponential backoff (manual implementation)
- Mniej efektywne dla high volume

### Risks

| Risk | Mitigation |
|------|------------|
| High volume exceeds capacity | Monitor processing lag, migrate to BullMQ when needed |
| Polling overhead | Advisory lock query is cheap (<1ms), acceptable |

## Related

- [SPEC: Document Processing Scheduler](../specifications/2025-12-28-document-processing-scheduler.md)
- [ADR-2025-12-26: Background Email Queue](./ADR-2025-12-26-background-email-queue.md) - używa podobny pattern dla emails

## Notes

Email queue używa BullMQ bo:
1. Emails mogą być delayed (scheduled sending)
2. Email failures wymagają retry z backoff
3. Volume może być wyższy (notifications, etc.)

Document processing używa cron bo:
1. Brak scheduled processing (ASAP)
2. Retry = next cron cycle (proste)
3. Volume przewidywalnie niski (<100/day)
