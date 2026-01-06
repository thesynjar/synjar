# SPEC-008: Chunking Strategy Selection by Plan

**Date:** 2025-12-24
**Status:** Draft
**Priority:** P1 (Feature differentiation)
**Dependencies:** ENTERPRISE-007 (Plan - enterprise), SPEC-007 (Fixed-size chunking)

---

## 1. Business Goal

Automatic chunking strategy selection based on user's plan - FREE uses fixed-size, PREMIUM uses LLM-based.

### MVP Value

- Product differentiation (PREMIUM = better chunking)
- Cost control (LLM only for paying users)
- Transparency for user

---

## 2. Functional Requirements

### 2.1 Plan to Strategy Mapping

| Plan | Strategy | Description |
|------|-----------|------|
| FREE | FIXED_SIZE | Programmatic, no LLM |
| STARTER+ | SMART | LLM-based for small/medium documents |
| STARTER+ | HIERARCHICAL | LLM-based for large documents |

### 2.2 Selection Logic (for PREMIUM)

```
IF tokens < 1000:
  → NO_SPLIT (1 chunk)
ELSE IF tokens < 10000:
  → SMART (LLM semantic)
ELSE:
  → HIERARCHICAL (structure + LLM)
```

### 2.3 Selection Logic (for FREE)

```
IF tokens < 500:
  → NO_SPLIT (1 chunk)
ELSE:
  → FIXED_SIZE (programmatic)
```

---

## 3. Implementation

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

### 3.2 DocumentProcessorService Update

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

### 3.3 Strategy Information in API

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

### 4.1 Informational Endpoint

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

## 5. Acceptance Tests

### 5.1 Test: FREE user uses FIXED_SIZE

```gherkin
Scenario: FREE user uploads document
  Given User with FREE plan
  And Document of 2000 tokens
  When User uploads document
  Then Document is processed with FIXED_SIZE strategy
  And Chunk.metadata.strategy = "FIXED_SIZE"
```

### 5.2 Test: PREMIUM user uses SMART

```gherkin
Scenario: PREMIUM user uploads medium document
  Given User with STARTER plan
  And Document of 5000 tokens
  When User uploads document
  Then Document is processed with SMART strategy
  And Chunk.metadata.strategy = "SMART"
```

### 5.3 Test: PREMIUM user with large document

```gherkin
Scenario: PREMIUM user uploads large document
  Given User with PRO plan
  And Document of 50000 tokens
  When User uploads document
  Then Document is processed with HIERARCHICAL strategy
```

### 5.4 Test: Small document not split

```gherkin
Scenario: Small document = 1 chunk
  Given User (any plan)
  And Document of 300 tokens
  When User uploads document
  Then Document has 1 chunk (NO_SPLIT)
```

---

## 6. Upgrade Path

When FREE user upgrades to PREMIUM:
- Existing documents are **NOT** automatically re-processed
- User can manually request re-processing (v2 feature)
- New documents use better strategy

---

## 7. Definition of Done

- [ ] ChunkingStrategySelector service
- [ ] DocumentProcessorService update
- [ ] Strategy metadata in Chunk
- [ ] Preview endpoint (optional)
- [ ] Unit tests
- [ ] Integration tests

---

## 8. Estimation

| Task | Complexity |
|---------|-----------|
| ChunkingStrategySelector | S |
| Processor update | S |
| Tests | M |
| **TOTAL** | **S-M** |

---

## 9. Next Specification

After implementation: **SPEC-009: Conflict Auditor (PREMIUM)**
