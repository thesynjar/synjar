# SPEC-007: Fixed-size Chunking (FREE)

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P1 (Feature differentiation)
**Zależności:** ENTERPRISE-007 (Plan) - enterprise repo

---

## 1. Cel biznesowy

Implementacja prostszej strategii chunking dla planu FREE - dzielenie programistyczne po sekcjach z overlap, bez użycia LLM.

### Wartość MVP

- Obniżenie kosztów dla FREE users (brak wywołań LLM)
- Różnicowanie produktu (PREMIUM = lepszy chunking)
- Nadal dobra jakość wyszukiwania dla prostych dokumentów

---

## 2. Wymagania funkcjonalne

### 2.1 Strategia Fixed-size

| Parametr | Wartość |
|----------|---------|
| Chunk size | 500 tokenów (target) |
| Overlap | 10-15% (50-75 tokenów) |
| Separator priority | `\n\n` (akapity) > `\n` (linie) > `. ` (zdania) |
| Min chunk size | 100 tokenów |
| Max chunk size | 750 tokenów |

### 2.2 Algorytm

```
1. Podziel tekst na akapity (split by \n\n)
2. Dla każdego akapitu:
   a. Jeśli < min_size → łącz z następnym
   b. Jeśli > max_size → podziel po zdaniach
3. Dodaj overlap z poprzedniego chunka (ostatnie 50-75 tokenów)
4. Zachowaj metadata: startOffset, endOffset, chunkIndex
```

### 2.3 Obsługa formatów

| Format | Separatory |
|--------|------------|
| Markdown | `##`, `###`, `---`, `\n\n` |
| Plain text | `\n\n`, `\n`, `. ` |
| PDF (extracted) | `\n\n`, page breaks |
| DOCX (extracted) | Paragraph markers, `\n\n` |

---

## 3. Implementacja

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

### 3.2 Rejestracja strategii

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

## 4. Porównanie strategii

| Aspekt | FIXED_SIZE | SMART (LLM) |
|--------|------------|-------------|
| Koszt | $0 | ~$0.001 per 1K tokens |
| Latency | <100ms | 1-5s |
| Quality | Good | Excellent |
| Semantic coherence | Medium | High |
| Use case | Simple docs | Complex docs |

---

## 5. Testy akceptacyjne

### 5.1 Test: Podział na chunki

```gherkin
Scenario: Dokument dzielony na chunki ~500 tokenów
  Given Dokument tekstowy 2000 tokenów
  When Przetwarzam przez FixedSizeChunkingStrategy
  Then Otrzymuję 4-5 chunków
  And Każdy chunk ma 400-600 tokenów
  And Chunki mają overlap ~12%
```

### 5.2 Test: Zachowanie akapitów

```gherkin
Scenario: Akapit nie jest dzielony jeśli mieści się w limicie
  Given Dokument z 3 akapitami po 200 tokenów
  When Przetwarzam przez FixedSizeChunkingStrategy
  Then Otrzymuję 2 chunki
  And Pierwszy chunk zawiera akapity 1-2
  And Drugi chunk zawiera akapit 3 + overlap
```

### 5.3 Test: Duży akapit dzielony po zdaniach

```gherkin
Scenario: Duży akapit jest dzielony
  Given Akapit 1000 tokenów (jedna ściana tekstu)
  When Przetwarzam przez FixedSizeChunkingStrategy
  Then Akapit jest podzielony na ~2 chunki
  And Podział następuje między zdaniami
```

### 5.4 Test: Markdown headers jako separatory

```gherkin
Scenario: Headers markdown dzielą sekcje
  Given Dokument markdown:
    """
    ## Section 1
    Content 1...

    ## Section 2
    Content 2...
    """
  When Przetwarzam przez FixedSizeChunkingStrategy
  Then Sekcje są osobnymi chunkami (jeśli wystarczająco duże)
```

---

## 6. Definition of Done

- [ ] FixedSizeChunkingStrategy implementation
- [ ] Unit testy strategii
- [ ] Testy z różnymi formatami (MD, TXT, extracted PDF)
- [ ] Benchmarki wydajności
- [ ] Dokumentacja algorytmu

---

## 7. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| Implementacja strategii | M |
| Obsługa różnych formatów | S |
| Testy | M |
| **TOTAL** | **M** |

---

## 8. Następna specyfikacja

Po wdrożeniu: **SPEC-008: Wybór strategii chunking wg planu**
