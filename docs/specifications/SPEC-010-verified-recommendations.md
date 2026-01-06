# SPEC-010: Verified Chunk Recommendations

**Date:** 2025-12-24
**Status:** Draft
**Priority:** P2 (Premium feature)
**Dependencies:** ENTERPRISE-007 (Plan - recommendations flag) - enterprise repo

---

## 1. Business Goal

A system recommending verified documents/chunks based on unverified content. Helps in the knowledge verification process and building a coherent base.

### MVP Value

- When user adds an unverified document, system suggests related verified sources
- Helps in fact-checking process
- Identifies gaps in verified knowledge

---

## 2. Functional Requirements

### 2.1 Availability

| Plan | Recommendations |
|------|-----------------|
| FREE | No |
| STARTER | No |
| BASIC | No |
| PRO+ | Yes |

### 2.2 Use Cases

1. **Suggestions when adding document**
   - User adds unverified document
   - System automatically suggests related verified sources

2. **On-demand recommendation search**
   - User asks: "What verified sources match this document?"
   - System returns recommendation ranking

3. **Gap identification**
   - User has unverified document
   - System informs: "No verified sources on this topic"

### 2.3 Recommendation Algorithm

```
1. INPUT
   - Unverified document/chunk
   - Workspace context

2. SEMANTIC SEARCH
   - Find chunks with verificationStatus=VERIFIED
   - Semantic similarity > 0.7

3. RELEVANCE SCORING
   - Base: cosine similarity
   - Boost: same tags (+0.1)
   - Boost: recent documents (+0.05)

4. OUTPUT
   - Top N recommendations with score and explanation
```

---

## 3. Implementation

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

## 5. Acceptance Tests

### 5.1 Test: Recommendations for unverified document

```gherkin
Scenario: System recommends verified sources
  Given Verified document A: "Customer service procedure..."
  And Unverified document B: "Email from customer about service..."
  When User fetches recommendations for document B
  Then Response contains document A as recommendation
  And Score > 0.7
  And matchReason contains "Similar topic"
```

### 5.2 Test: No verified sources

```gherkin
Scenario: System informs about missing sources
  Given Unverified document about completely new topic
  And No verified documents about this topic
  When User fetches recommendations
  Then hasVerifiedGap = true
  And message contains "No verified sources found"
```

### 5.3 Test: Tag boost in ranking

```gherkin
Scenario: Documents with shared tags are ranked higher
  Given Unverified document with tag "support"
  And Verified document A with tag "support" (similarity 0.75)
  And Verified document B without shared tags (similarity 0.80)
  When User fetches recommendations
  Then Document A is ranked higher than B (due to tag boost)
```

---

## 6. Workflow Integration

### 6.1 Auto-suggestions when creating document

```typescript
// In DocumentController, after creating unverified document

@Post()
async createDocument(...) {
  const document = await this.documentService.create(workspaceId, dto, file);

  // If PREMIUM and unverified, include recommendations
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
- [ ] PremiumFeatureGuard for RECOMMENDATIONS
- [ ] Integration in createDocument (auto-suggestions)
- [ ] /gaps endpoint
- [ ] Unit tests
- [ ] Integration tests
- [ ] API documentation

---

## 8. Estimation

| Task | Complexity |
|---------|-----------|
| RecommendationService | M |
| Controller + API | S |
| Integration | S |
| Tests | M |
| **TOTAL** | **M** |

---

## 9. Next Specification

After implementation: **SPEC-011: Frontend - Auth**
