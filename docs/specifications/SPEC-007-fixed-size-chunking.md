# SPEC-007: Fixed-size Chunking (FREE)

**Date:** 2025-12-24
**Status:** Draft
**Priority:** P1 (Feature differentiation)
**Dependencies:** ENTERPRISE-007 (Plan) - enterprise repo

---

## 1. Business Goal

Implementation of a simpler chunking strategy for the FREE plan - programmatic division by sections with overlap, without using LLM.

### MVP Value

- Lower costs for FREE users (no LLM calls)
- Product differentiation (PREMIUM = better chunking)
- Still good search quality for simple documents

---

## 2. Functional Requirements

### 2.1 Fixed-size Strategy

| Parameter | Value |
|----------|---------|
| Chunk size | 500 tokens (target) |
| Overlap | 10-15% (50-75 tokens) |
| Separator priority | `\n\n` (paragraphs) > `\n` (lines) > `. ` (sentences) |
| Min chunk size | 100 tokens |
| Max chunk size | 750 tokens |

### 2.2 Algorithm

```
1. Split text into paragraphs (split by \n\n)
2. For each paragraph:
   a. If < min_size → merge with next
   b. If > max_size → split by sentences
3. Add overlap from previous chunk (last 50-75 tokens)
4. Preserve metadata: startOffset, endOffset, chunkIndex
```

### 2.3 Format Handling

| Format | Separators |
|--------|------------|
| Markdown | `##`, `###`, `---`, `\n\n` |
| Plain text | `\n\n`, `\n`, `. ` |
| PDF (extracted) | `\n\n`, page breaks |
| DOCX (extracted) | Paragraph markers, `\n\n` |

---

## 3. Implementation

### 3.1 FixedSizeChunkingStrategy

```typescript
// src/application/chunking/strategies/fixed-size.strategy.ts

@Injectable()
export class FixedSizeChunkingStrategy implements IChunkingStrategy {
  private readonly TARGET_TOKENS = 500;
  private readonly MIN_TOKENS = 100;
  private readonly MAX_TOKENS = 750;
  private readonly OVERLAP_RATIO = 0.12; // 12% overlap

  async chunk(content: string, options?: ChunkingOptions): Promise<ChunkResult[]> {
    const paragraphs = this.splitIntoParagraphs(content);
    const chunks: ChunkResult[] = [];

    let currentChunk = '';
    let currentOffset = 0;
    let chunkIndex = 0;
    let previousOverlap = '';

    for (const paragraph of paragraphs) {
      const paragraphTokens = this.countTokens(paragraph);

      // Paragraph too large - split by sentences
      if (paragraphTokens > this.MAX_TOKENS) {
        // Flush current chunk first
        if (currentChunk) {
          chunks.push(this.createChunk(
            previousOverlap + currentChunk,
            chunkIndex++,
            currentOffset,
          ));
          previousOverlap = this.getOverlap(currentChunk);
          currentOffset += currentChunk.length;
          currentChunk = '';
        }

        // Split large paragraph
        const sentenceChunks = this.splitBySentences(paragraph);
        for (const sentenceChunk of sentenceChunks) {
          chunks.push(this.createChunk(
            previousOverlap + sentenceChunk,
            chunkIndex++,
            currentOffset,
          ));
          previousOverlap = this.getOverlap(sentenceChunk);
          currentOffset += sentenceChunk.length;
        }
        continue;
      }

      const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
      const potentialTokens = this.countTokens(potentialChunk);

      if (potentialTokens > this.TARGET_TOKENS) {
        // Flush current chunk
        if (currentChunk && this.countTokens(currentChunk) >= this.MIN_TOKENS) {
          chunks.push(this.createChunk(
            previousOverlap + currentChunk,
            chunkIndex++,
            currentOffset,
          ));
          previousOverlap = this.getOverlap(currentChunk);
          currentOffset += currentChunk.length;
        }
        currentChunk = paragraph;
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Flush remaining
    if (currentChunk && this.countTokens(currentChunk) >= this.MIN_TOKENS) {
      chunks.push(this.createChunk(
        previousOverlap + currentChunk,
        chunkIndex++,
        currentOffset,
      ));
    } else if (currentChunk && chunks.length > 0) {
      // Append to last chunk if too small
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.content += '\n\n' + currentChunk;
      lastChunk.endOffset = currentOffset + currentChunk.length;
    }

    return chunks;
  }

  private splitIntoParagraphs(content: string): string[] {
    // Handle markdown headers as separators
    const normalized = content
      .replace(/^(#{1,6})\s+/gm, '\n\n$1 ')
      .replace(/---+/g, '\n\n');

    return normalized
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  private splitBySentences(text: string): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      const potential = current + sentence;
      if (this.countTokens(potential) > this.TARGET_TOKENS && current) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current = potential;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  private getOverlap(text: string): string {
    const tokens = this.tokenize(text);
    const overlapTokenCount = Math.floor(tokens.length * this.OVERLAP_RATIO);
    const overlapTokens = tokens.slice(-overlapTokenCount);
    return this.detokenize(overlapTokens) + ' ';
  }

  private countTokens(text: string): number {
    // Simplified: ~4 chars per token for English
    // For production: use tiktoken or similar
    return Math.ceil(text.length / 4);
  }

  private tokenize(text: string): string[] {
    return text.split(/\s+/);
  }

  private detokenize(tokens: string[]): string {
    return tokens.join(' ');
  }

  private createChunk(
    content: string,
    index: number,
    startOffset: number,
  ): ChunkResult {
    return {
      content: content.trim(),
      chunkIndex: index,
      startOffset,
      endOffset: startOffset + content.length,
      chunkType: 'fixed-size',
      metadata: {
        strategy: 'FIXED_SIZE',
        tokenCount: this.countTokens(content),
        hasOverlap: index > 0,
      },
    };
  }
}
```

### 3.2 Strategy Registration

```typescript
// src/application/chunking/chunking.module.ts

const chunkingStrategies = {
  FIXED_SIZE: FixedSizeChunkingStrategy,
  SMART: LlmSmartChunkingStrategy,
  HIERARCHICAL: HierarchicalChunkingStrategy,
};

@Module({
  providers: [
    FixedSizeChunkingStrategy,
    LlmSmartChunkingStrategy,
    HierarchicalChunkingStrategy,
    {
      provide: 'CHUNKING_STRATEGIES',
      useFactory: (...strategies) => {
        return new Map(Object.entries(chunkingStrategies).map(
          ([key], idx) => [key, strategies[idx]]
        ));
      },
      inject: [
        FixedSizeChunkingStrategy,
        LlmSmartChunkingStrategy,
        HierarchicalChunkingStrategy,
      ],
    },
  ],
})
export class ChunkingModule {}
```

---

## 4. Strategy Comparison

| Aspect | FIXED_SIZE | SMART (LLM) |
|--------|------------|-------------|
| Cost | $0 | ~$0.001 per 1K tokens |
| Latency | <100ms | 1-5s |
| Quality | Good | Excellent |
| Semantic coherence | Medium | High |
| Use case | Simple docs | Complex docs |

---

## 5. Acceptance Tests

### 5.1 Test: Division into chunks

```gherkin
Scenario: Document divided into chunks ~500 tokens
  Given Text document of 2000 tokens
  When Processed by FixedSizeChunkingStrategy
  Then We get 4-5 chunks
  And Each chunk has 400-600 tokens
  And Chunks have ~12% overlap
```

### 5.2 Test: Paragraph preservation

```gherkin
Scenario: Paragraph is not split if it fits in limit
  Given Document with 3 paragraphs of 200 tokens each
  When Processed by FixedSizeChunkingStrategy
  Then We get 2 chunks
  And First chunk contains paragraphs 1-2
  And Second chunk contains paragraph 3 + overlap
```

### 5.3 Test: Large paragraph split by sentences

```gherkin
Scenario: Large paragraph is split
  Given Paragraph of 1000 tokens (one wall of text)
  When Processed by FixedSizeChunkingStrategy
  Then Paragraph is split into ~2 chunks
  And Split occurs between sentences
```

### 5.4 Test: Markdown headers as separators

```gherkin
Scenario: Markdown headers split sections
  Given Markdown document:
    """
    ## Section 1
    Content 1...

    ## Section 2
    Content 2...
    """
  When Processed by FixedSizeChunkingStrategy
  Then Sections are separate chunks (if large enough)
```

---

## 6. Definition of Done

- [ ] FixedSizeChunkingStrategy implementation
- [ ] Unit tests for strategy
- [ ] Tests with various formats (MD, TXT, extracted PDF)
- [ ] Performance benchmarks
- [ ] Algorithm documentation

---

## 7. Estimation

| Task | Complexity |
|---------|-----------|
| Strategy implementation | M |
| Various format handling | S |
| Tests | M |
| **TOTAL** | **M** |

---

## 8. Next Specification

After implementation: **SPEC-008: Chunking strategy selection by plan**
