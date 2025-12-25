# SPEC-008: Wybór strategii chunking wg planu

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P1 (Feature differentiation)
**Zależności:** ENTERPRISE-007 (Plan - enterprise), SPEC-007 (Fixed-size chunking)

---

## 1. Cel biznesowy

Automatyczny wybór strategii chunking na podstawie planu użytkownika - FREE używa fixed-size, PREMIUM używa LLM-based.

### Wartość MVP

- Różnicowanie produktu (PREMIUM = lepszy chunking)
- Kontrola kosztów (LLM tylko dla płacących)
- Transparentność dla użytkownika

---

## 2. Wymagania funkcjonalne

### 2.1 Mapowanie plan → strategia

| Plan | Strategia | Opis |
|------|-----------|------|
| FREE | FIXED_SIZE | Programistyczny, bez LLM |
| STARTER+ | SMART | LLM-based dla małych/średnich dokumentów |
| STARTER+ | HIERARCHICAL | LLM-based dla dużych dokumentów |

### 2.2 Logika wyboru (dla PREMIUM)

```
IF tokens < 1000:
  → NO_SPLIT (1 chunk)
ELSE IF tokens < 10000:
  → SMART (LLM semantic)
ELSE:
  → HIERARCHICAL (structure + LLM)
```

### 2.3 Logika wyboru (dla FREE)

```
IF tokens < 500:
  → NO_SPLIT (1 chunk)
ELSE:
  → FIXED_SIZE (programistyczny)
```

---

## 3. Implementacja

### 3.1 ChunkingStrategySelector

```typescript
// src/application/chunking/chunking-strategy-selector.service.ts

@Injectable()
export class ChunkingStrategySelector {
  constructor(
    private subscriptionService: SubscriptionService,
    @Inject('CHUNKING_STRATEGIES')
    private strategies: Map<string, IChunkingStrategy>,
  ) {}

  async selectStrategy(
    userId: string,
    content: string,
  ): Promise<{ strategy: IChunkingStrategy; name: string }> {
    const limits = await this.subscriptionService.getUserPlanLimits(userId);
    const tokenCount = this.estimateTokens(content);

    // FREE plan - always fixed-size
    if (limits.chunkingStrategy === 'FIXED_SIZE') {
      if (tokenCount < 500) {
        return {
          strategy: this.strategies.get('NO_SPLIT')!,
          name: 'NO_SPLIT',
        };
      }
      return {
        strategy: this.strategies.get('FIXED_SIZE')!,
        name: 'FIXED_SIZE',
      };
    }

    // PREMIUM plans - smart selection
    if (tokenCount < 1000) {
      return {
        strategy: this.strategies.get('NO_SPLIT')!,
        name: 'NO_SPLIT',
      };
    }

    if (tokenCount < 10000) {
      return {
        strategy: this.strategies.get('SMART')!,
        name: 'SMART',
      };
    }

    return {
      strategy: this.strategies.get('HIERARCHICAL')!,
      name: 'HIERARCHICAL',
    };
  }

  private estimateTokens(content: string): number {
    // ~4 chars per token for English text
    return Math.ceil(content.length / 4);
  }
}
```

### 3.2 Aktualizacja DocumentProcessorService

```typescript
// src/application/document/document-processor.service.ts

@Injectable()
export class DocumentProcessorService {
  constructor(
    private chunkingSelector: ChunkingStrategySelector,
    private embeddingsService: IEmbeddingsService,
    private prisma: PrismaService,
  ) {}

  async processDocument(document: Document, userId: string): Promise<void> {
    try {
      // Update status
      await this.updateStatus(document.id, 'PROCESSING');

      // Parse file if needed
      const content = await this.extractContent(document);

      // Select chunking strategy based on user's plan
      const { strategy, name } = await this.chunkingSelector.selectStrategy(
        userId,
        content,
      );

      // Log which strategy was used
      console.log(`Processing document ${document.id} with strategy: ${name}`);

      // Chunk the document
      const chunks = await strategy.chunk(content);

      // Generate embeddings
      const embeddings = await this.embeddingsService.generateBatch(
        chunks.map(c => c.content),
      );

      // Store chunks with embeddings
      await this.storeChunks(document.id, chunks, embeddings, name);

      // Update status
      await this.updateStatus(document.id, 'COMPLETED');

    } catch (error) {
      await this.updateStatus(document.id, 'FAILED', error.message);
      throw error;
    }
  }

  private async storeChunks(
    documentId: string,
    chunks: ChunkResult[],
    embeddings: number[][],
    strategyName: string,
  ): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      await this.prisma.$executeRaw`
        INSERT INTO "Chunk" (
          id, "documentId", content, embedding,
          "chunkIndex", "startOffset", "endOffset",
          "chunkType", metadata, "createdAt"
        ) VALUES (
          gen_random_uuid(),
          ${documentId},
          ${chunk.content},
          ${embeddings[i]}::vector,
          ${chunk.chunkIndex},
          ${chunk.startOffset},
          ${chunk.endOffset},
          ${chunk.chunkType},
          ${JSON.stringify({
            ...chunk.metadata,
            strategy: strategyName,
          })}::jsonb,
          NOW()
        )
      `;
    }
  }
}
```

### 3.3 Informacja o użytej strategii w API

```typescript
// Response DTO
interface DocumentResponseDto {
  id: string;
  title: string;
  // ...
  processing: {
    status: ProcessingStatus;
    chunkingStrategy?: string;  // 'FIXED_SIZE' | 'SMART' | 'HIERARCHICAL'
    chunksCount?: number;
    error?: string;
  };
}
```

---

## 4. API

### 4.1 Endpoint informacyjny

```typescript
// GET /chunking/preview

interface ChunkingPreviewRequestDto {
  content: string;
}

interface ChunkingPreviewResponseDto {
  estimatedTokens: number;
  selectedStrategy: string;
  estimatedChunks: number;
  note: string;  // "Upgrade to PREMIUM for semantic chunking"
}
```

---

## 5. Testy akceptacyjne

### 5.1 Test: FREE user używa FIXED_SIZE

```gherkin
Scenario: FREE user uploaduje dokument
  Given User z planem FREE
  And Dokument 2000 tokenów
  When User uploaduje dokument
  Then Dokument jest przetwarzany strategią FIXED_SIZE
  And Chunk.metadata.strategy = "FIXED_SIZE"
```

### 5.2 Test: PREMIUM user używa SMART

```gherkin
Scenario: PREMIUM user uploaduje średni dokument
  Given User z planem STARTER
  And Dokument 5000 tokenów
  When User uploaduje dokument
  Then Dokument jest przetwarzany strategią SMART
  And Chunk.metadata.strategy = "SMART"
```

### 5.3 Test: PREMIUM user z dużym dokumentem

```gherkin
Scenario: PREMIUM user uploaduje duży dokument
  Given User z planem PRO
  And Dokument 50000 tokenów
  When User uploaduje dokument
  Then Dokument jest przetwarzany strategią HIERARCHICAL
```

### 5.4 Test: Mały dokument nie jest dzielony

```gherkin
Scenario: Mały dokument = 1 chunk
  Given User (dowolny plan)
  And Dokument 300 tokenów
  When User uploaduje dokument
  Then Dokument ma 1 chunk (NO_SPLIT)
```

---

## 6. Upgrade path

Gdy FREE user upgraduje do PREMIUM:
- Istniejące dokumenty **NIE** są automatycznie re-procesowane
- User może ręcznie zażądać re-processingu (v2 feature)
- Nowe dokumenty używają lepszej strategii

---

## 7. Definition of Done

- [ ] ChunkingStrategySelector service
- [ ] Aktualizacja DocumentProcessorService
- [ ] Metadata o strategii w Chunk
- [ ] Endpoint preview (opcjonalnie)
- [ ] Testy jednostkowe
- [ ] Testy integracyjne

---

## 8. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| ChunkingStrategySelector | S |
| Aktualizacja processor | S |
| Testy | M |
| **TOTAL** | **S-M** |

---

## 9. Następna specyfikacja

Po wdrożeniu: **SPEC-009: Conflict Auditor (PREMIUM)**
