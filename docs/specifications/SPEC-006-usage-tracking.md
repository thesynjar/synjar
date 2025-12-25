# SPEC-006: Usage Tracking

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P1 (Visibility)
**Zależności:** ENTERPRISE-007 (Plan - enterprise), SPEC-004 (Document limit), SPEC-005 (Storage limit)

---

## 1. Cel biznesowy

Zapewnienie pełnej widoczności wykorzystania zasobów dla użytkownika i systemu.

### Wartość MVP

- User widzi ile wykorzystał z każdego limitu
- Podstawa do alertów o zbliżaniu się do limitu
- Dashboard z usage w aplikacji

---

## 2. Wymagania funkcjonalne

### 2.1 Metryki do śledzenia

| Metryka | Zakres | Jak liczymy |
|---------|--------|-------------|
| Workspaces count | Per user (OWNER) | COUNT WorkspaceMember WHERE role=OWNER |
| Documents count | Per workspace | COUNT Document WHERE workspaceId |
| Storage used | Per user (wszystkie owned ws) | SUM(fileSize + content length) |
| Chunks count | Per workspace | COUNT Chunk |
| Public links | Per workspace | COUNT PublicLink |

### 2.2 Dane historyczne (opcjonalnie v2)

W MVP liczymy na żywo. W v2 można dodać:
- Dzienny snapshot usage
- Trendy (wzrost/spadek)
- Alerty przy 80%, 90%, 100%

---

## 3. API

### 3.1 Endpointy

```
GET /usage                     # Całościowe usage usera
GET /usage/workspaces          # Usage per workspace
GET /workspaces/:id/usage      # Usage konkretnego workspace'a
```

### 3.2 DTOs

```typescript
// GET /usage
interface UserUsageResponseDto {
  plan: {
    name: PlanName;
    validUntil: string | null;
  };
  workspaces: {
    current: number;
    limit: number;
    percentUsed: number;
  };
  storage: {
    currentBytes: number;
    currentMb: number;
    limitMb: number;
    percentUsed: number;
  };
  summary: {
    totalDocuments: number;
    totalChunks: number;
    totalPublicLinks: number;
  };
}

// GET /usage/workspaces
interface WorkspacesUsageResponseDto {
  workspaces: {
    id: string;
    name: string;
    role: Role;
    documents: {
      current: number;
      limit: number;      // limit zależy od OWNER'a
      percentUsed: number;
    };
    storage: {
      bytes: number;
      mb: number;
    };
    chunks: number;
    publicLinks: number;
  }[];
}

// GET /workspaces/:id/usage
interface WorkspaceUsageResponseDto {
  workspace: {
    id: string;
    name: string;
  };
  limits: {
    documentsLimit: number;    // -1 = unlimited
    storageLimitMb: number;
  };
  documents: {
    total: number;
    byStatus: {
      pending: number;
      processing: number;
      completed: number;
      failed: number;
    };
    byVerification: {
      verified: number;
      unverified: number;
    };
    byType: {
      text: number;
      file: number;
    };
  };
  storage: {
    filesBytes: number;
    contentBytes: number;
    totalBytes: number;
    totalMb: number;
  };
  chunks: {
    total: number;
    avgPerDocument: number;
  };
  publicLinks: {
    total: number;
    active: number;
    expired: number;
  };
  recentActivity: {
    documentsLast7Days: number;
    documentsLast30Days: number;
  };
}
```

---

## 4. Implementacja

### 4.1 UsageService

```typescript
// src/application/usage/usage.service.ts

@Injectable()
export class UsageService {
  constructor(
    private prisma: PrismaService,
    private subscriptionService: SubscriptionService,
  ) {}

  async getUserUsage(userId: string): Promise<UserUsage> {
    const [subscription, ownedWorkspaces, storageUsage] = await Promise.all([
      this.subscriptionService.getSubscription(userId),
      this.prisma.workspaceMember.count({
        where: { userId, role: 'OWNER' },
      }),
      this.storageUsageService.getUserStorageUsage(userId),
    ]);

    const plan = subscription.plan;

    return {
      plan: {
        name: plan.name,
        validUntil: subscription.validUntil,
      },
      workspaces: {
        current: ownedWorkspaces,
        limit: plan.maxWorkspaces,
        percentUsed: this.calculatePercent(ownedWorkspaces, plan.maxWorkspaces),
      },
      storage: {
        currentBytes: storageUsage.totalBytes,
        currentMb: storageUsage.totalBytes / (1024 * 1024),
        limitMb: plan.totalStorageMb,
        percentUsed: this.calculatePercent(
          storageUsage.totalBytes / (1024 * 1024),
          plan.totalStorageMb,
        ),
      },
    };
  }

  async getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
    const [
      workspace,
      documentStats,
      chunkStats,
      publicLinkStats,
      storageStats,
      recentDocs,
    ] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: {
          members: { where: { role: 'OWNER' } },
        },
      }),
      this.getDocumentStats(workspaceId),
      this.getChunkStats(workspaceId),
      this.getPublicLinkStats(workspaceId),
      this.getStorageStats(workspaceId),
      this.getRecentDocumentActivity(workspaceId),
    ]);

    // Get owner's plan limits
    const ownerId = workspace.members[0]?.userId;
    const limits = ownerId
      ? await this.subscriptionService.getUserPlanLimits(ownerId)
      : null;

    return {
      workspace: { id: workspace.id, name: workspace.name },
      limits: {
        documentsLimit: limits?.maxDocumentsPerWs ?? -1,
        storageLimitMb: limits?.totalStorageMb ?? -1,
      },
      documents: documentStats,
      storage: storageStats,
      chunks: chunkStats,
      publicLinks: publicLinkStats,
      recentActivity: recentDocs,
    };
  }

  private async getDocumentStats(workspaceId: string) {
    const docs = await this.prisma.document.groupBy({
      by: ['processingStatus', 'verificationStatus', 'contentType'],
      where: { workspaceId },
      _count: true,
    });

    // Aggregate stats...
    return {
      total: docs.reduce((sum, d) => sum + d._count, 0),
      byStatus: { /* ... */ },
      byVerification: { /* ... */ },
      byType: { /* ... */ },
    };
  }

  private calculatePercent(current: number, limit: number): number {
    if (limit === -1) return 0;
    if (limit === 0) return 100;
    return Math.min(100, Math.round((current / limit) * 100));
  }
}
```

### 4.2 UsageController

```typescript
// src/interfaces/http/usage.controller.ts

@Controller('usage')
@UseGuards(JwtAuthGuard)
@ApiTags('Usage')
export class UsageController {
  constructor(private usageService: UsageService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user usage summary' })
  async getUserUsage(
    @CurrentUser() user: JwtPayload,
  ): Promise<UserUsageResponseDto> {
    return this.usageService.getUserUsage(user.sub);
  }

  @Get('workspaces')
  @ApiOperation({ summary: 'Get usage breakdown by workspace' })
  async getWorkspacesUsage(
    @CurrentUser() user: JwtPayload,
  ): Promise<WorkspacesUsageResponseDto> {
    return this.usageService.getWorkspacesUsage(user.sub);
  }
}
```

---

## 5. Testy akceptacyjne

### 5.1 Test: User widzi swoje usage

```gherkin
Scenario: User pobiera swoje usage
  Given User z planem FREE
  And User ma 1 workspace z 50 dokumentami używającymi 45 MB
  When User wykonuje GET /usage
  Then Response zawiera:
    | workspaces.current | 1 |
    | workspaces.limit | 1 |
    | workspaces.percentUsed | 100 |
    | storage.currentMb | 45 |
    | storage.limitMb | 100 |
    | storage.percentUsed | 45 |
```

### 5.2 Test: Usage per workspace

```gherkin
Scenario: User widzi szczegóły workspace'a
  Given Workspace z 10 dokumentami (5 verified, 5 unverified)
  When User wykonuje GET /workspaces/{id}/usage
  Then Response zawiera:
    | documents.total | 10 |
    | documents.byVerification.verified | 5 |
    | documents.byVerification.unverified | 5 |
```

---

## 6. Definition of Done

- [ ] UsageService z metodami
- [ ] GET /usage endpoint
- [ ] GET /usage/workspaces endpoint
- [ ] GET /workspaces/:id/usage endpoint
- [ ] Testy jednostkowe
- [ ] Dokumentacja Swagger

---

## 7. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| UsageService | M |
| Endpoints | S |
| Testy | S |
| **TOTAL** | **M** |

---

## 8. Następna specyfikacja

Po wdrożeniu: **SPEC-007: Fixed-size chunking dla FREE**
