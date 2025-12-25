# SPEC-001: Row Level Security (RLS)

**Data:** 2025-12-24
**Status:** Done
**Priorytet:** P0 (Fundament)
**Zależności:** Brak

---

## 1. Cel biznesowy

Zapewnienie izolacji danych między workspace'ami na poziomie bazy danych. Nawet w przypadku błędu w kodzie aplikacji, użytkownik nie może uzyskać dostępu do danych innego workspace'a.

### Wartość MVP

- Bezpieczeństwo danych klientów
- Compliance-ready (GDPR, SOC2)
- Defense in depth - druga warstwa ochrony po kodzie aplikacyjnym

---

## 2. Wymagania funkcjonalne

### 2.1 Polityki RLS

| Tabela | Polityka | Opis |
|--------|----------|------|
| `Workspace` | `workspace_isolation` | User widzi tylko workspace'y, których jest członkiem |
| `WorkspaceMember` | `member_isolation` | User widzi tylko członkostwa swoich workspace'ów |
| `Document` | `document_isolation` | User widzi tylko dokumenty z workspace'ów, których jest członkiem |
| `Chunk` | `chunk_isolation` | User widzi tylko chunki z dokumentów, do których ma dostęp |
| `DocumentTag` | `tag_isolation` | User widzi tylko tagi dokumentów, do których ma dostęp |
| `PublicLink` | `public_link_isolation` | User widzi tylko linki swoich workspace'ów |

### 2.2 Session context

Aplikacja ustawia `app.current_user_id` na początku każdego requestu:

```sql
SET LOCAL app.current_user_id = 'uuid-user-id';
```

### 2.3 Wyjątki

- Tabela `User` - brak RLS (użytkownik może widzieć tylko siebie przez JWT)
- Tabela `Tag` - globalna (tagi są współdzielone między workspace'ami)
- Public API - osobny mechanizm (token-based, bypass RLS)

---

## 3. Model danych

### 3.1 Brak zmian w schemacie Prisma

RLS jest implementowany przez raw SQL migrations, nie wymaga zmian w schema.prisma.

### 3.2 Migracja SQL

```sql
-- Enable RLS on tables
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Chunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicLink" ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner (app user)
ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Chunk" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTag" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PublicLink" FORCE ROW LEVEL SECURITY;

-- Helper function: get current user's workspace IDs
CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT wm."workspaceId"::UUID
  FROM "WorkspaceMember" wm
  WHERE wm."userId" = current_setting('app.current_user_id', true)::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Policy: Workspace isolation
CREATE POLICY workspace_isolation ON "Workspace"
  FOR ALL
  USING (
    id::UUID IN (SELECT get_user_workspace_ids())
  );

-- Policy: WorkspaceMember isolation
CREATE POLICY member_isolation ON "WorkspaceMember"
  FOR ALL
  USING (
    "workspaceId"::UUID IN (SELECT get_user_workspace_ids())
  );

-- Policy: Document isolation
CREATE POLICY document_isolation ON "Document"
  FOR ALL
  USING (
    "workspaceId"::UUID IN (SELECT get_user_workspace_ids())
  );

-- Policy: Chunk isolation (through document)
CREATE POLICY chunk_isolation ON "Chunk"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId"::UUID IN (SELECT get_user_workspace_ids())
    )
  );

-- Policy: DocumentTag isolation (through document)
CREATE POLICY tag_isolation ON "DocumentTag"
  FOR ALL
  USING (
    "documentId" IN (
      SELECT d.id FROM "Document" d
      WHERE d."workspaceId"::UUID IN (SELECT get_user_workspace_ids())
    )
  );

-- Policy: PublicLink isolation
CREATE POLICY public_link_isolation ON "PublicLink"
  FOR ALL
  USING (
    "workspaceId"::UUID IN (SELECT get_user_workspace_ids())
  );
```

---

## 4. Implementacja

### 4.1 RLS Middleware (NestJS)

```typescript
// src/infrastructure/persistence/rls/rls.middleware.ts

@Injectable()
export class RlsMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = req.user as JwtPayload | undefined;

    if (user?.sub) {
      // Set session variable for RLS
      await this.prisma.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = '${user.sub}'`
      );
    }

    next();
  }
}
```

### 4.2 Prisma Transaction Wrapper

```typescript
// src/infrastructure/persistence/prisma/prisma.service.ts

@Injectable()
export class PrismaService extends PrismaClient {

  async withRls<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = '${userId}'`
      );
      return fn();
    });
  }
}
```

### 4.3 Bypass dla Public API

```typescript
// src/infrastructure/persistence/rls/rls-bypass.service.ts

@Injectable()
export class RlsBypassService {
  constructor(private prisma: PrismaService) {}

  // Używane tylko przez PublicController
  async withBypass<T>(fn: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Reset user context - RLS policies return empty for null user
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = ''`
      );
      // Lub użyj dedykowanego połączenia bez RLS
      return fn();
    });
  }
}
```

### 4.4 Alternatywa: Osobna rola DB dla public API

```sql
-- Rola bez RLS restrictions
CREATE ROLE synjar_public;
GRANT SELECT ON "Document", "Chunk", "PublicLink" TO synjar_public;

-- Polityka dla public role (wszystko widoczne)
CREATE POLICY public_access ON "Document"
  FOR SELECT
  TO synjar_public
  USING (true);
```

---

## 5. Testy akceptacyjne

### 5.1 Test: Izolacja workspace'ów

```gherkin
Scenario: User nie widzi dokumentów z obcego workspace'a
  Given User A jest członkiem Workspace A
  And User B jest członkiem Workspace B
  And Document X należy do Workspace B
  When User A wykonuje GET /workspaces/{wsA}/documents
  Then Response nie zawiera Document X

Scenario: User nie widzi obcego workspace'a
  Given User A jest członkiem Workspace A
  And Workspace B istnieje (User A nie jest członkiem)
  When User A wykonuje GET /workspaces
  Then Response nie zawiera Workspace B
```

### 5.2 Test: RLS blokuje nawet przy błędzie w kodzie

```gherkin
Scenario: Próba dostępu do dokumentu przez manipulację ID
  Given User A jest członkiem Workspace A
  And Document X (id: "doc-x") należy do Workspace B
  When User A wykonuje GET /workspaces/{wsA}/documents/doc-x
  Then Response status 404 (dokument niewidoczny przez RLS)
```

### 5.3 Test: Public API działa mimo RLS

```gherkin
Scenario: Public API zwraca dokumenty bez user context
  Given PublicLink z token "abc123" dla Workspace A
  And Document X należy do Workspace A
  When External system wykonuje GET /public/abc123/search?query=test
  Then Response zawiera wyniki z Document X
```

---

## 6. Ryzyka i mitigacje

| Ryzyko | Prawdopodobieństwo | Impact | Mitigacja |
|--------|-------------------|--------|-----------|
| Wydajność (dodatkowe joiny) | Średnie | Niski | Indeksy na workspaceId, cache get_user_workspace_ids() |
| Zapomnienie SET LOCAL | Niskie | Wysoki | Middleware + testy integracyjne |
| Bypass w złym miejscu | Niskie | Wysoki | Code review, dedykowany serwis RlsBypassService |

---

## 7. Definition of Done

- [x] Migracja SQL z politykami RLS
- [x] RLS Middleware w NestJS
- [x] Wrapper `forUser()` i `withCurrentUser()` w PrismaService
- [x] RlsBypassService dla Public API (zaimplementowane jako `withoutRls()` w PrismaService)
- [x] Testy integracyjne izolacji (**26/26 tests PASSING**)
- [x] Użytkownik bazodanowy non-superuser (`knowledge_forge_app`)
- [x] Testy wydajnościowe (benchmark przed/po RLS) - **avg 0.93ms, max 1.40ms**
- [x] Dokumentacja w README

---

## 8. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| Migracja SQL | S |
| RLS Middleware | S |
| PrismaService wrapper | S |
| Public API bypass | S |
| Testy | M |
| **TOTAL** | **M** |

---

## 9. Implementation Notes (2025-12-25)

### Status: ✅ FULLY IMPLEMENTED

### Final Solution
The key insight from `core-platform` was to use a direct column comparison for INSERT policies
(like `tenant_id = require_tenant_context()`) instead of subquery-based policies.

**Solution applied:** Added `createdById` column to Workspace table and use it in INSERT policy:
```sql
CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  WITH CHECK ("createdById" = get_current_user_id());
```

This follows the same pattern as core-platform's multi-tenant RLS and works correctly with Prisma ORM.

### Migrations Applied
1. `20251225102653_add_rls` - Initial RLS setup with policies
2. `20251225103500_fix_rls_function` - Fixed TEXT/UUID type mismatch
3. `20251225104500_add_system_bypass` - Added SYSTEM context for bypassing RLS
4. `20251225105000_fix_insert_policies` - Split policies into SELECT/INSERT/UPDATE/DELETE
5. `20251225110000_fix_insert_check` - Fixed INSERT WITH CHECK clause
6. `20251225120000_add_created_by_to_workspace` - Added createdById column
7. `20251225140000_fix_workspace_rls` - Final fix with createdById-based INSERT policy

### Components
1. **Database User**: `synjar_app` (non-superuser, RLS enforced)
2. **RlsMiddleware**: Sets `app.current_user_id` from JWT
3. **PrismaService**:
   - `forUser(userId, callback)` - execute with specific user context
   - `withCurrentUser(callback)` - execute with current request user
   - `withoutRls(callback)` - bypass RLS using SYSTEM context
4. **PrismaSystemService**: Superuser client for migrations/tests
5. **UserContext**: AsyncLocalStorage-based request isolation

### Database Configuration
```bash
# Application uses non-superuser (RLS enforced)
DATABASE_URL="postgresql://synjar_app:...@localhost:6201/synjar"

# Superuser for migrations only
DATABASE_URL_MIGRATE="postgresql://postgres:...@localhost:6201/synjar"
```

### Test Results: 26/26 PASSING
- 8 test suites covering all RLS scenarios
- Workspace, Document, Chunk, WorkspaceMember, PublicLink isolation
- ID manipulation blocking
- Stress tests (50+ parallel operations)
- Context switching tests

### Key Learnings
1. PostgreSQL superuser always bypasses RLS - use non-superuser for production
2. For INSERT policies, use direct column comparison (`createdById = get_current_user_id()`) not subquery
3. Subquery-based policies (like `id IN (SELECT get_user_workspace_ids())`) have chicken-and-egg problem for INSERT
4. Prisma ORM interactive transactions work correctly with `set_config()` when policies are designed properly
5. Follow core-platform pattern: one policy per operation type, direct value comparison for INSERT

### Current Status
- **RLS Tests**: 26/26 PASSING
- **Development mode**: Uses non-superuser (`synjar_app`) - production-like environment
- **Full API flow**: Register → Login → Create Workspace → List Workspaces - all working with RLS enforced

## 10. Następna specyfikacja

Po wdrożeniu RLS: **ENTERPRISE-007: Model Plan i Subscription** (enterprise repo)
