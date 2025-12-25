# SPEC-009: Conflict Auditor (PREMIUM)

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P2 (Premium feature)
**Zależności:** ENTERPRISE-007 (Plan - conflictDetection flag) - enterprise repo

---

## 1. Cel biznesowy

System wykrywający sprzeczności między dokumentami w bazie wiedzy. Pomaga utrzymać spójność wiedzy i identyfikować nieaktualne informacje.

### Wartość MVP

- Wykrywanie konfliktów między dokumentami
- Raport sprzeczności z opisem problemu
- Workflow do rozwiązywania konfliktów

---

## 2. Wymagania funkcjonalne

### 2.1 Dostępność

| Plan | Conflict Detection |
|------|-------------------|
| FREE | ❌ |
| STARTER | ❌ |
| BASIC+ | ✅ |

### 2.2 Triggery audytu

1. **On-demand** - użytkownik ręcznie uruchamia audyt
2. **Po dodaniu dokumentu** - automatyczne sprawdzenie nowego dokumentu
3. **Scheduled** (v2) - periodyczne sprawdzanie całej bazy

### 2.3 Algorytm wykrywania

```
1. CANDIDATE SELECTION
   - Znajdź dokumenty o podobnej tematyce (semantic similarity > 0.75)
   - Ogranicz do dokumentów z tymi samymi tagami

2. PAIRWISE COMPARISON
   - Dla każdej pary kandydatów wyślij do LLM
   - Prompt: "Czy te fragmenty są sprzeczne?"

3. CONFLICT CLASSIFICATION
   - CONTRADICTION: Bezpośrednia sprzeczność faktów
   - OUTDATED: Jeden dokument jest prawdopodobnie nieaktualny
   - AMBIGUOUS: Niejasność/dwuznaczność
   - NO_CONFLICT: Brak konfliktu

4. REPORT GENERATION
   - Zapisz wykryte konflikty
   - Wygeneruj opis dla użytkownika
```

### 2.4 Status konfliktu

| Status | Opis |
|--------|------|
| PENDING | Wykryty, czeka na review |
| REVIEWED | Przejrzany przez usera |
| RESOLVED | Rozwiązany (jeden z dokumentów zmieniony) |
| IGNORED | Świadomie zignorowany |
| FALSE_POSITIVE | Błędnie wykryty |

---

## 3. Model danych

### 3.1 Prisma Schema

```prisma
model ConflictReport {
  id          String   @id @default(uuid())
  workspaceId String

  // Conflicting documents
  documentAId String
  documentBId String
  chunkAId    String?   // Specific chunk (optional)
  chunkBId    String?

  // Conflict details
  conflictType ConflictType
  severity     ConflictSeverity
  description  String    @db.Text
  suggestion   String?   @db.Text

  // Status
  status      ConflictStatus @default(PENDING)
  reviewedAt  DateTime?      @db.Timestamptz
  reviewedBy  String?
  resolution  String?        @db.Text

  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  documentA   Document  @relation("ConflictDocA", fields: [documentAId], references: [id], onDelete: Cascade)
  documentB   Document  @relation("ConflictDocB", fields: [documentBId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([status])
  @@index([documentAId])
  @@index([documentBId])
}

enum ConflictType {
  CONTRADICTION   // Direct factual contradiction
  OUTDATED        // One document likely outdated
  AMBIGUOUS       // Unclear/ambiguous information
  DUPLICATE       // Near-duplicate content
}

enum ConflictSeverity {
  LOW       // Minor inconsistency
  MEDIUM    // Notable conflict
  HIGH      // Critical contradiction
}

enum ConflictStatus {
  PENDING
  REVIEWED
  RESOLVED
  IGNORED
  FALSE_POSITIVE
}

// Update Workspace model
model Workspace {
  // ... existing fields ...
  conflictReports ConflictReport[]
}

// Update Document model
model Document {
  // ... existing fields ...
  conflictsAsA ConflictReport[] @relation("ConflictDocA")
  conflictsAsB ConflictReport[] @relation("ConflictDocB")
}
```

---

## 4. Implementacja

### 4.1 ConflictAuditorService

```typescript
// src/application/conflict/conflict-auditor.service.ts

@Injectable()
export class ConflictAuditorService {
  constructor(
    private prisma: PrismaService,
    private searchRepository: ISearchRepository,
    private llmService: ILlmService,
    private subscriptionService: SubscriptionService,
  ) {}

  async auditDocument(
    documentId: string,
    userId: string,
  ): Promise<ConflictReport[]> {
    // Check if user has access to conflict detection
    const canUse = await this.subscriptionService.canUseFeature(
      userId,
      'CONFLICT_DETECTION',
    );

    if (!canUse) {
      throw new ForbiddenException({
        error: 'FEATURE_NOT_AVAILABLE',
        message: 'Conflict detection is available in BASIC plan and above.',
        upgradeUrl: '/plans',
      });
    }

    const document = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { chunks: true },
    });

    const conflicts: ConflictReport[] = [];

    // For each chunk, find similar chunks from other documents
    for (const chunk of document.chunks) {
      const candidates = await this.findSimilarChunks(
        chunk,
        document.workspaceId,
        documentId,
      );

      for (const candidate of candidates) {
        const conflict = await this.compareChunks(
          chunk,
          candidate,
          document.workspaceId,
        );

        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  private async findSimilarChunks(
    chunk: Chunk,
    workspaceId: string,
    excludeDocumentId: string,
  ): Promise<Chunk[]> {
    // Use semantic search to find similar chunks
    const results = await this.searchRepository.searchSimilar({
      workspaceId,
      embedding: chunk.embedding,
      limit: 10,
      minScore: 0.75,
      excludeDocumentIds: [excludeDocumentId],
    });

    return results.map(r => r.chunk);
  }

  private async compareChunks(
    chunkA: Chunk,
    chunkB: Chunk,
    workspaceId: string,
  ): Promise<ConflictReport | null> {
    const prompt = this.buildComparisonPrompt(chunkA.content, chunkB.content);

    const response = await this.llmService.complete({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CONFLICT_DETECTION_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      responseFormat: { type: 'json_object' },
    });

    const result = JSON.parse(response.content) as ConflictAnalysis;

    if (result.hasConflict) {
      return this.prisma.conflictReport.create({
        data: {
          workspaceId,
          documentAId: chunkA.documentId,
          documentBId: chunkB.documentId,
          chunkAId: chunkA.id,
          chunkBId: chunkB.id,
          conflictType: result.type,
          severity: result.severity,
          description: result.description,
          suggestion: result.suggestion,
          status: 'PENDING',
        },
      });
    }

    return null;
  }

  private buildComparisonPrompt(contentA: string, contentB: string): string {
    return `
Compare these two text fragments and determine if they contain conflicting information:

FRAGMENT A:
${contentA}

FRAGMENT B:
${contentB}

Analyze and respond in JSON format.
    `.trim();
  }
}

const CONFLICT_DETECTION_SYSTEM_PROMPT = `
You are a knowledge base auditor. Your task is to identify conflicts between text fragments.

Types of conflicts:
- CONTRADICTION: Direct factual contradiction (e.g., "X is true" vs "X is false")
- OUTDATED: One fragment appears to be outdated version of the other
- AMBIGUOUS: Information is unclear or could be interpreted differently
- DUPLICATE: Near-duplicate content that should be consolidated

Severity levels:
- LOW: Minor inconsistency, not critical
- MEDIUM: Notable conflict that should be addressed
- HIGH: Critical contradiction that could cause problems

Respond with JSON:
{
  "hasConflict": boolean,
  "type": "CONTRADICTION" | "OUTDATED" | "AMBIGUOUS" | "DUPLICATE" | null,
  "severity": "LOW" | "MEDIUM" | "HIGH" | null,
  "description": "Human-readable description of the conflict",
  "suggestion": "Suggested resolution"
}

If no conflict, return: { "hasConflict": false }
`;
```

### 4.2 ConflictController

```typescript
// src/interfaces/http/conflict.controller.ts

@Controller('workspaces/:workspaceId/conflicts')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard, PremiumFeatureGuard)
@ApiTags('Conflicts')
export class ConflictController {
  constructor(private conflictService: ConflictAuditorService) {}

  @Post('audit')
  @ApiOperation({ summary: 'Run conflict audit on workspace' })
  async auditWorkspace(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AuditResultDto> {
    return this.conflictService.auditWorkspace(workspaceId, user.sub);
  }

  @Post('audit/document/:documentId')
  @ApiOperation({ summary: 'Audit single document for conflicts' })
  async auditDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ConflictReport[]> {
    return this.conflictService.auditDocument(documentId, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'List all conflicts in workspace' })
  async listConflicts(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListConflictsQueryDto,
  ): Promise<ConflictListResponseDto> {
    return this.conflictService.listConflicts(workspaceId, query);
  }

  @Get(':conflictId')
  @ApiOperation({ summary: 'Get conflict details' })
  async getConflict(
    @Param('conflictId') conflictId: string,
  ): Promise<ConflictDetailDto> {
    return this.conflictService.getConflict(conflictId);
  }

  @Patch(':conflictId')
  @ApiOperation({ summary: 'Update conflict status' })
  async updateConflict(
    @Param('conflictId') conflictId: string,
    @Body() dto: UpdateConflictDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ConflictReport> {
    return this.conflictService.updateConflict(conflictId, dto, user.sub);
  }
}
```

---

## 5. API

### 5.1 Endpoints

```
POST   /workspaces/:id/conflicts/audit              # Full workspace audit
POST   /workspaces/:id/conflicts/audit/document/:id # Single document audit
GET    /workspaces/:id/conflicts                    # List conflicts
GET    /workspaces/:id/conflicts/:id                # Conflict details
PATCH  /workspaces/:id/conflicts/:id                # Update status
```

### 5.2 Response DTOs

```typescript
interface ConflictListResponseDto {
  conflicts: ConflictSummaryDto[];
  summary: {
    total: number;
    pending: number;
    resolved: number;
    byType: Record<ConflictType, number>;
    bySeverity: Record<ConflictSeverity, number>;
  };
}

interface ConflictDetailDto {
  id: string;
  conflictType: ConflictType;
  severity: ConflictSeverity;
  status: ConflictStatus;
  description: string;
  suggestion: string | null;
  documentA: {
    id: string;
    title: string;
    excerpt: string;  // Relevant chunk content
  };
  documentB: {
    id: string;
    title: string;
    excerpt: string;
  };
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  resolution: string | null;
}

interface UpdateConflictDto {
  status: ConflictStatus;
  resolution?: string;
}
```

---

## 6. Testy akceptacyjne

### 6.1 Test: Wykrycie sprzeczności

```gherkin
Scenario: System wykrywa sprzeczność między dokumentami
  Given Dokument A: "Termin zwrotu to 14 dni"
  And Dokument B: "Termin zwrotu to 30 dni"
  When Uruchamiam audyt dokumentu B
  Then System wykrywa konflikt typu CONTRADICTION
  And Severity = HIGH
```

### 6.2 Test: Brak konfliktu

```gherkin
Scenario: System nie zgłasza fałszywych konfliktów
  Given Dokument A: "Procedura A dotyczy klientów indywidualnych"
  And Dokument B: "Procedura B dotyczy klientów biznesowych"
  When Uruchamiam audyt
  Then System nie wykrywa konfliktu
```

### 6.3 Test: FREE user nie ma dostępu

```gherkin
Scenario: FREE user nie może używać conflict detection
  Given User z planem FREE
  When User wykonuje POST /conflicts/audit
  Then Response status 403
  And Error = "FEATURE_NOT_AVAILABLE"
```

---

## 7. Koszty

| Operacja | Koszt LLM |
|----------|-----------|
| Porównanie pary chunków | ~$0.001 |
| Audyt dokumentu (10 chunków, 5 kandydatów each) | ~$0.05 |
| Audyt workspace (100 dokumentów) | ~$5 |

Rekomendacja: Limit audytów per miesiąc w planach.

---

## 8. Definition of Done

- [ ] ConflictReport model + migracja
- [ ] ConflictAuditorService
- [ ] ConflictController + endpoints
- [ ] PremiumFeatureGuard
- [ ] Testy jednostkowe
- [ ] Testy integracyjne z LLM (mocked)
- [ ] Dokumentacja API

---

## 9. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| Model danych | S |
| ConflictAuditorService | L |
| Controller + API | M |
| Testy | M |
| **TOTAL** | **L** |

---

## 10. Następna specyfikacja

Po wdrożeniu: **SPEC-010: Rekomendacje zweryfikowanych chunków**
