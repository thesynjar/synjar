# SPEC: Document Processing Scheduler

**Data:** 2025-12-28
**Status:** In Review
**Autor:** Claude
**ADR:** [ADR-004: Document Processing - Cron vs Message Queue](../adr/ADR-004-document-processing-cron-vs-queue.md)

## Problem

Po seedowaniu bazy danych dokumenty mają status `PENDING`, ale nie są automatycznie przetwarzane (generowanie embeddingów). Brak mechanizmu retry/cron powoduje, że:

1. Dokumenty pozostają w stanie `PENDING` na zawsze
2. Search nie zwraca wyników (filtruje tylko `COMPLETED`)
3. Dev flow wymaga ręcznego triggerowania przetwarzania

## Rozwiązanie

Dodać **cron job** (`@nestjs/schedule`) który co N sekund sprawdza dokumenty `PENDING` i przetwarza je z uwzględnieniem:
- **Distributed locking** (PostgreSQL advisory locks) dla Cloud multi-instance
- **Tenant isolation** (processing per workspace z RLS context)
- **Retry logic** z exponential backoff
- **Timeout** dla pojedynczego przetwarzania

## Scope

### In Scope
- Automatyczne przetwarzanie dokumentów PENDING
- Multi-instance safety (Cloud deployment)
- Tenant isolation (RLS)
- Configurable interval i batch size
- Retry logic dla transient failures
- Timeout protection

### Out of Scope
- Message queue (BullMQ) - patrz ADR-004
- Real-time processing notifications
- Priority queue dla dokumentów

## Zmiany

### 1. Nowa zależność

```bash
pnpm add @nestjs/schedule
```

### 2. Nowy plik: `document-processing.scheduler.ts`

**Lokalizacja:** `src/application/document/document-processing.scheduler.ts`

```typescript
@Injectable()
export class DocumentProcessingScheduler {
  private readonly logger = new Logger(DocumentProcessingScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentProcessor: DocumentProcessorService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingDocuments(): Promise<void> {
    // 1. Acquire distributed lock (PostgreSQL advisory lock)
    const lockAcquired = await this.tryAcquireLock();
    if (!lockAcquired) {
      return; // Another instance is processing
    }

    try {
      // 2. Get workspaces with pending documents
      const workspacesWithPending = await this.getWorkspacesWithPendingDocs();

      // 3. Process per workspace (RLS context)
      for (const workspace of workspacesWithPending) {
        await this.processWorkspaceDocuments(workspace);
      }
    } finally {
      // 4. Release lock
      await this.releaseLock();
    }
  }

  private async tryAcquireLock(): Promise<boolean> {
    // PostgreSQL advisory lock (key = hash of 'document-processing')
    const result = await this.prisma.$queryRaw<[{pg_try_advisory_lock: boolean}]>`
      SELECT pg_try_advisory_lock(hashtext('document-processing-scheduler'))
    `;
    return result[0].pg_try_advisory_lock;
  }

  private async releaseLock(): Promise<void> {
    await this.prisma.$queryRaw`
      SELECT pg_advisory_unlock(hashtext('document-processing-scheduler'))
    `;
  }

  private async processWorkspaceDocuments(workspace: { id: string; ownerId: string }): Promise<void> {
    const batchSize = this.configService.get<number>('DOCUMENT_PROCESSING_BATCH_SIZE', 5);
    const timeout = this.configService.get<number>('DOCUMENT_PROCESSING_TIMEOUT_MS', 60000);

    // Process with RLS context (tenant isolation)
    await this.prisma.forUser(workspace.ownerId, async (tx) => {
      const pendingDocs = await tx.document.findMany({
        where: {
          workspaceId: workspace.id,
          processingStatus: ProcessingStatus.PENDING,
        },
        select: { id: true, title: true },
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });

      for (const doc of pendingDocs) {
        try {
          await this.processWithTimeout(doc.id, timeout);
          this.logger.log(`Processed: ${doc.title} (workspace: ${workspace.id})`);
        } catch (error) {
          this.logger.error(
            `Failed to process document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
          // Continue with next document
        }
      }
    });
  }

  private async processWithTimeout(documentId: string, timeoutMs: number): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await Promise.race([
        this.documentProcessor.processDocument(documentId),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error(`Document processing timeout after ${timeoutMs}ms`));
          });
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
```

### 3. Modyfikacja `app.module.ts`

```typescript
import { ScheduleModule } from '@nestjs/schedule';

// W getCoreModules():
ScheduleModule.forRoot(),
```

### 4. Modyfikacja `document.module.ts`

```typescript
import { DocumentProcessingScheduler } from './document-processing.scheduler';

providers: [
  // ...existing
  DocumentProcessingScheduler,
],
```

## Zachowanie

| Scenariusz | Zachowanie |
|------------|------------|
| Brak dokumentów PENDING | Cron nic nie robi |
| 1-5 dokumentów PENDING (1 workspace) | Przetwarza wszystkie |
| >5 dokumentów PENDING (1 workspace) | Przetwarza 5, reszta w następnym cyklu |
| Dokumenty w wielu workspaces | Fair processing - każdy workspace dostaje batch |
| Błąd przetwarzania | Loguje błąd, kontynuuje z następnym dokumentem |
| Timeout (>60s) | Przerywa, oznacza jako FAILED |
| Inny instance już przetwarza | Pomija (distributed lock) |
| Transient failure | Retry w następnym cyklu (dokument nadal PENDING) |

## Konfiguracja

| Zmienna | Default | Opis |
|---------|---------|------|
| `DOCUMENT_PROCESSING_INTERVAL` | 10000 | Interwał w ms |
| `DOCUMENT_PROCESSING_BATCH_SIZE` | 5 | Max dokumentów per workspace per cykl |
| `DOCUMENT_PROCESSING_TIMEOUT_MS` | 60000 | Timeout per dokument |
| `DOCUMENT_PROCESSING_MAX_RETRIES` | 3 | Max retry dla transient failures |

## Multi-Instance Safety (Cloud)

### Problem
W Cloud deployment (Kubernetes) może być wiele instancji API. Bez synchronizacji:
- Ten sam dokument może być przetwarzany równolegle
- Race conditions przy update statusu
- Duplicate API calls do OpenAI (cost!)

### Rozwiązanie: PostgreSQL Advisory Locks

```sql
-- Acquire lock (non-blocking)
SELECT pg_try_advisory_lock(hashtext('document-processing-scheduler'));

-- Release lock
SELECT pg_advisory_unlock(hashtext('document-processing-scheduler'));
```

**Dlaczego PostgreSQL a nie Redis?**
- Zero dodatkowych dependencies (już mamy PostgreSQL)
- ACID guarantees
- Automatic cleanup przy crash

## Tenant Isolation (RLS)

### Problem
Scheduler działa bez user context → RLS policies nie działają → potencjalny cross-tenant access.

### Rozwiązanie: Process per Workspace

```typescript
// Dla każdego workspace z PENDING docs:
await this.prisma.forUser(workspace.ownerId, async (tx) => {
  // RLS automatycznie filtruje tylko dokumenty z tego workspace
  const docs = await tx.document.findMany({...});
});
```

**Benefits:**
- RLS enforcement
- Fair processing (każdy tenant ma równy dostęp)
- Audit trail per workspace

## Compliance (GDPR)

### Data Handling
- Document content wysyłany do OpenAI dla embeddings
- OpenAI Data Processing Agreement (DPA) required
- Logs NIE zawierają document content (tylko title, id)

### Audit Logging
```typescript
this.logger.log(`Processed: ${doc.title} (workspace: ${workspace.id})`);
// NIE logujemy: doc.content, user emails, sensitive metadata
```

## Test Scenarios

### Scenario 1: No pending documents
```gherkin
Given: Brak dokumentów PENDING w żadnym workspace
When: Cron wywołuje processPendingDocuments()
Then:
  - Lock acquired
  - Brak przetwarzania
  - Lock released
  - Żadne logi "Processed:"
```

### Scenario 2: Single workspace, 3 documents
```gherkin
Given:
  - Workspace "General" z owner user-1
  - 3 dokumenty PENDING: doc1, doc2, doc3
When: Cron wywołuje processPendingDocuments()
Then:
  - Lock acquired
  - prisma.forUser(user-1) called
  - doc1, doc2, doc3 przetworzone (kolejność createdAt)
  - 3x logger.log("Processed: ...")
  - Lock released
```

### Scenario 3: Batch limit (>5 docs)
```gherkin
Given:
  - Workspace "General" z 7 dokumentami PENDING
  - DOCUMENT_PROCESSING_BATCH_SIZE = 5
When: Cron wywołuje processPendingDocuments()
Then:
  - 5 dokumentów przetworzonych (najstarsze)
  - 2 dokumenty pozostają PENDING
  - Następny cykl przetworzy pozostałe 2
```

### Scenario 4: Processing error (continues)
```gherkin
Given:
  - 3 dokumenty PENDING: doc1, doc2, doc3
  - DocumentProcessorService.processDocument(doc2.id) throws Error
When: Cron wywołuje processPendingDocuments()
Then:
  - doc1 przetworzony OK
  - doc2 error zalogowany
  - doc3 NADAL przetworzony (błąd nie przerywa pętli)
  - Lock released (even on error)
```

### Scenario 5: Distributed lock (concurrent instances)
```gherkin
Given:
  - Instance A: już ma lock
  - Instance B: próbuje procesować
When: Instance B wywołuje processPendingDocuments()
Then:
  - pg_try_advisory_lock returns FALSE
  - Instance B immediately returns
  - Brak duplicate processing
```

### Scenario 6: Timeout protection
```gherkin
Given:
  - DOCUMENT_PROCESSING_TIMEOUT_MS = 5000
  - DocumentProcessorService.processDocument() takes 10 seconds
When: Cron przetwarza dokument
Then:
  - After 5s: AbortError thrown
  - Document status updated to FAILED
  - Error logged
  - Next document processed
```

## Ryzyka i Mitigacje

| Ryzyko | Mitigacja |
|--------|-----------|
| OpenAI rate limits | Batch size 5, configurable |
| Duplicate processing (multi-instance) | PostgreSQL advisory locks |
| Memory leaks | Singleton scheduler, no state accumulation |
| Stuck processing | Timeout protection (60s default) |
| Cross-tenant access | RLS via forUser() |
| Transient failures | Retry w następnym cyklu |

## Alternatywy rozważone

Patrz [ADR-004: Document Processing - Cron vs Message Queue](../adr/ADR-004-document-processing-cron-vs-queue.md)

1. **Przetwarzanie w seedzie** - wymaga OPENAI_API_KEY podczas seeda
2. **Manual command** - nie automatyczne
3. **Message queue (BullMQ)** - więcej złożoności, ale lepsze dla high volume

## Definition of Done

- [x] `@nestjs/schedule` zainstalowany
- [x] `ScheduleModule.forRoot()` w `app.module.ts`
- [ ] `DocumentProcessingScheduler` z distributed lock
- [ ] Tenant isolation (forUser per workspace)
- [ ] Configurable interval/batch/timeout
- [ ] Unit tests (6 scenarios)
- [ ] Integration test
- [ ] ADR-004 utworzony
- [ ] Po uruchomieniu API dokumenty PENDING są automatycznie przetwarzane

## Review History

### 2025-12-28 - Pre-Implementation Review
- Reviewed by: Claude (architecture, security, documentation, test)
- Status: ⚠️ Requires changes
- Findings:
  - [Architecture Review](../../docs/agents/architecture-reviewer/reports/2025-12-28-18-32-architecture-review.md)
  - [Security Review](../../docs/agents/security-reviewer/reports/2025-12-28-18-29-security-review.md)
  - [Documentation Review](../../docs/agents/documentation-reviewer/reports/2025-12-28-18-28-documentation-review.md)
  - [Test Review](../../docs/agents/test-reviewer/reports/2025-12-28-18-27-scheduler-testability-review.md)
- Changes made:
  - Added distributed locking (PostgreSQL advisory locks)
  - Added tenant isolation (process per workspace with RLS)
  - Added configurable interval/batch/timeout
  - Added 6 test scenarios with Given-When-Then
  - Added GDPR compliance section
  - Created ADR-004
