# SPEC-010: Rekomendacje zweryfikowanych chunków

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P2 (Premium feature)
**Zależności:** ENTERPRISE-007 (Plan - recommendations flag) - enterprise repo

---

## 1. Cel biznesowy

System rekomendujący zweryfikowane dokumenty/chunki na podstawie treści niezweryfikowanych. Pomaga w procesie weryfikacji wiedzy i budowania spójnej bazy.

### Wartość MVP

- Gdy user dodaje niezweryfikowany dokument, system sugeruje powiązane zweryfikowane źródła
- Pomaga w procesie fact-checking
- Identyfikuje luki w zweryfikowanej wiedzy

---

## 2. Wymagania funkcjonalne

### 2.1 Dostępność

| Plan | Recommendations |
|------|-----------------|
| FREE | ❌ |
| STARTER | ❌ |
| BASIC | ❌ |
| PRO+ | ✅ |

### 2.2 Use cases

1. **Sugestie przy dodawaniu dokumentu**
   - User dodaje niezweryfikowany dokument
   - System automatycznie sugeruje powiązane zweryfikowane źródła

2. **Wyszukiwanie rekomendacji on-demand**
   - User pyta: "Jakie zweryfikowane źródła pasują do tego dokumentu?"
   - System zwraca ranking rekomendacji

3. **Identyfikacja luk**
   - User ma niezweryfikowany dokument
   - System informuje: "Brak zweryfikowanych źródeł w tym temacie"

### 2.3 Algorytm rekomendacji

```
1. INPUT
   - Niezweryfikowany dokument/chunk
   - Workspace context

2. SEMANTIC SEARCH
   - Znajdź chunki z verificationStatus=VERIFIED
   - Podobieństwo semantyczne > 0.7

3. RELEVANCE SCORING
   - Base: cosine similarity
   - Boost: same tags (+0.1)
   - Boost: recent documents (+0.05)

4. OUTPUT
   - Top N rekomendacji z score i explanation
```

---

## 3. Implementacja

### 3.1 RecommendationService

```typescript
// src/application/recommendation/recommendation.service.ts

@Injectable()
export class RecommendationService {
  constructor(
    private searchRepository: ISearchRepository,
    private embeddingsService: IEmbeddingsService,
    private subscriptionService: SubscriptionService,
    private prisma: PrismaService,
  ) {}

  async getRecommendationsForDocument(
    documentId: string,
    userId: string,
    options: RecommendationOptions = {},
  ): Promise<RecommendationResult> {
    // Check access
    const canUse = await this.subscriptionService.canUseFeature(
      userId,
      'RECOMMENDATIONS',
    );

    if (!canUse) {
      throw new ForbiddenException({
        error: 'FEATURE_NOT_AVAILABLE',
        message: 'Recommendations are available in PRO plan and above.',
        upgradeUrl: '/plans',
      });
    }

    const document = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: {
        chunks: true,
        tags: { include: { tag: true } },
      },
    });

    // Only for unverified documents
    if (document.verificationStatus === 'VERIFIED') {
      return {
        recommendations: [],
        message: 'Document is already verified.',
      };
    }

    const documentTags = document.tags.map(t => t.tag.name);

    // Aggregate recommendations from all chunks
    const allRecommendations: ScoredRecommendation[] = [];

    for (const chunk of document.chunks) {
      const chunkRecommendations = await this.findVerifiedSimilar(
        chunk,
        document.workspaceId,
        documentId,
        documentTags,
        options.limit ?? 5,
      );
      allRecommendations.push(...chunkRecommendations);
    }

    // Deduplicate and sort
    const deduped = this.deduplicateAndRank(allRecommendations);

    // Check for gaps
    const hasGaps = deduped.length === 0;

    return {
      recommendations: deduped.slice(0, options.limit ?? 10),
      hasVerifiedGap: hasGaps,
      message: hasGaps
        ? 'No verified sources found for this topic. Consider creating verified documentation.'
        : `Found ${deduped.length} relevant verified sources.`,
    };
  }

  async getRecommendationsForChunk(
    chunkId: string,
    userId: string,
  ): Promise<ChunkRecommendation[]> {
    const chunk = await this.prisma.chunk.findUniqueOrThrow({
      where: { id: chunkId },
      include: {
        document: {
          include: { tags: { include: { tag: true } } },
        },
      },
    });

    const tags = chunk.document.tags.map(t => t.tag.name);

    return this.findVerifiedSimilar(
      chunk,
      chunk.document.workspaceId,
      chunk.documentId,
      tags,
      5,
    );
  }

  private async findVerifiedSimilar(
    chunk: Chunk,
    workspaceId: string,
    excludeDocumentId: string,
    sourceTags: string[],
    limit: number,
  ): Promise<ScoredRecommendation[]> {
    // Search only verified documents
    const results = await this.searchRepository.search({
      workspaceId,
      embedding: chunk.embedding,
      limit: limit * 2, // Get more for re-ranking
      minScore: 0.7,
      verificationStatus: 'VERIFIED',
      excludeDocumentIds: [excludeDocumentId],
    });

    // Re-rank with boosts
    return results.map(result => {
      let score = result.score;

      // Tag overlap boost
      const resultTags = result.document.tags.map(t => t.name);
      const tagOverlap = sourceTags.filter(t => resultTags.includes(t)).length;
      score += tagOverlap * 0.05;

      // Recency boost (last 30 days)
      const daysSinceUpdate = this.daysSince(result.document.updatedAt);
      if (daysSinceUpdate < 30) {
        score += 0.03;
      }

      return {
        documentId: result.document.id,
        documentTitle: result.document.title,
        chunkId: result.chunk.id,
        chunkExcerpt: this.truncate(result.chunk.content, 200),
        score,
        matchReason: this.generateMatchReason(result, tagOverlap),
        verifiedAt: result.document.updatedAt,
      };
    }).sort((a, b) => b.score - a.score);
  }

  private generateMatchReason(
    result: SearchResult,
    tagOverlap: number,
  ): string {
    const reasons: string[] = [];

    if (result.score > 0.9) {
      reasons.push('Highly similar content');
    } else if (result.score > 0.8) {
      reasons.push('Similar topic');
    } else {
      reasons.push('Related content');
    }

    if (tagOverlap > 0) {
      reasons.push(`${tagOverlap} shared tag(s)`);
    }

    return reasons.join(', ');
  }

  private deduplicateAndRank(
    recommendations: ScoredRecommendation[],
  ): ScoredRecommendation[] {
    const byDocument = new Map<string, ScoredRecommendation>();

    for (const rec of recommendations) {
      const existing = byDocument.get(rec.documentId);
      if (!existing || rec.score > existing.score) {
        byDocument.set(rec.documentId, rec);
      }
    }

    return Array.from(byDocument.values())
      .sort((a, b) => b.score - a.score);
  }

  private daysSince(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }
}
```

### 3.2 RecommendationController

```typescript
// src/interfaces/http/recommendation.controller.ts

@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
@ApiTags('Recommendations')
export class RecommendationController {
  constructor(private recommendationService: RecommendationService) {}

  @Get('documents/:documentId/recommendations')
  @UseGuards(PremiumFeatureGuard)
  @ApiOperation({ summary: 'Get verified recommendations for document' })
  async getDocumentRecommendations(
    @Param('documentId') documentId: string,
    @Query() query: RecommendationQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecommendationResultDto> {
    return this.recommendationService.getRecommendationsForDocument(
      documentId,
      user.sub,
      query,
    );
  }

  @Get('chunks/:chunkId/recommendations')
  @UseGuards(PremiumFeatureGuard)
  @ApiOperation({ summary: 'Get verified recommendations for chunk' })
  async getChunkRecommendations(
    @Param('chunkId') chunkId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChunkRecommendationDto[]> {
    return this.recommendationService.getRecommendationsForChunk(
      chunkId,
      user.sub,
    );
  }

  @Get('gaps')
  @UseGuards(PremiumFeatureGuard)
  @ApiOperation({ summary: 'Find unverified documents without verified matches' })
  async findVerificationGaps(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<VerificationGapsDto> {
    return this.recommendationService.findVerificationGaps(
      workspaceId,
      user.sub,
    );
  }
}
```

---

## 4. API

### 4.1 Endpoints

```
GET /workspaces/:id/documents/:docId/recommendations
GET /workspaces/:id/chunks/:chunkId/recommendations
GET /workspaces/:id/gaps  # Find docs without verified matches
```

### 4.2 Response DTOs

```typescript
interface RecommendationResultDto {
  recommendations: RecommendationDto[];
  hasVerifiedGap: boolean;
  message: string;
}

interface RecommendationDto {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkExcerpt: string;
  score: number;           // 0-1, higher = more relevant
  matchReason: string;     // "Highly similar content, 2 shared tags"
  verifiedAt: string;
}

interface VerificationGapsDto {
  unverifiedWithoutMatches: {
    documentId: string;
    documentTitle: string;
    topics: string[];      // Extracted topics
    suggestedAction: string;
  }[];
  summary: {
    totalUnverified: number;
    withVerifiedMatches: number;
    withoutMatches: number;
  };
}
```

---

## 5. Testy akceptacyjne

### 5.1 Test: Rekomendacje dla niezweryfikowanego dokumentu

```gherkin
Scenario: System rekomenduje zweryfikowane źródła
  Given Zweryfikowany dokument A: "Procedura obsługi klienta..."
  And Niezweryfikowany dokument B: "Email od klienta o obsłudze..."
  When User pobiera rekomendacje dla dokumentu B
  Then Response zawiera dokument A jako rekomendację
  And Score > 0.7
  And matchReason zawiera "Similar topic"
```

### 5.2 Test: Brak zweryfikowanych źródeł

```gherkin
Scenario: System informuje o braku źródeł
  Given Niezweryfikowany dokument o zupełnie nowym temacie
  And Brak zweryfikowanych dokumentów o tym temacie
  When User pobiera rekomendacje
  Then hasVerifiedGap = true
  And message zawiera "No verified sources found"
```

### 5.3 Test: Tag boost w rankingu

```gherkin
Scenario: Dokumenty ze wspólnymi tagami są wyżej
  Given Niezweryfikowany dokument z tagiem "support"
  And Zweryfikowany dokument A z tagiem "support" (similarity 0.75)
  And Zweryfikowany dokument B bez wspólnych tagów (similarity 0.80)
  When User pobiera rekomendacje
  Then Dokument A jest wyżej niż B (bo tag boost)
```

---

## 6. Integration z workflow

### 6.1 Auto-sugestie przy tworzeniu dokumentu

```typescript
// W DocumentController, po utworzeniu niezweryfikowanego dokumentu

@Post()
async createDocument(...) {
  const document = await this.documentService.create(workspaceId, dto, file);

  // Jeśli PREMIUM i niezweryfikowany, dołącz rekomendacje
  if (
    document.verificationStatus === 'UNVERIFIED' &&
    await this.subscriptionService.canUseFeature(userId, 'RECOMMENDATIONS')
  ) {
    const recommendations = await this.recommendationService
      .getRecommendationsForDocument(document.id, userId, { limit: 3 });

    return {
      ...document,
      recommendations: recommendations.recommendations,
    };
  }

  return document;
}
```

---

## 7. Definition of Done

- [ ] RecommendationService
- [ ] RecommendationController + endpoints
- [ ] PremiumFeatureGuard dla RECOMMENDATIONS
- [ ] Integration w createDocument (auto-sugestie)
- [ ] Endpoint /gaps
- [ ] Testy jednostkowe
- [ ] Testy integracyjne
- [ ] Dokumentacja API

---

## 8. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| RecommendationService | M |
| Controller + API | S |
| Integration | S |
| Testy | M |
| **TOTAL** | **M** |

---

## 9. Następna specyfikacja

Po wdrożeniu: **SPEC-011: Frontend - Auth**
