# ADR-2025-12-28: RLS Workspace Context Refactor

## Status

**Accepted**

## Context

### Obecna architektura (user-based RLS)

Obecny RLS (zaimplementowany w SPEC-001 3 dni temu) używa **user context**:

```sql
CREATE POLICY document_isolation ON "Document"
  FOR ALL
  USING ("workspaceId" IN (SELECT * FROM get_user_workspace_ids()));
```

Gdzie `get_user_workspace_ids()` to funkcja:

```sql
CREATE FUNCTION get_user_workspace_ids()
RETURNS SETOF UUID AS $$
  SELECT wm."workspaceId"
  FROM "WorkspaceMember" wm
  WHERE wm."userId" = current_setting('app.current_user_id', true)::UUID
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Problem

**Document Processing Scheduler** wymaga przetwarzania dokumentów per workspace, ale:

1. **Obecny RLS wymaga `user_id`** - scheduler musiał używać `workspace.createdById` jako context
2. **Semantycznie niepoprawne** - scheduler przetwarza workspace, nie user
3. **`withoutRls()` jest niebezpieczne** - bypasuje CAŁE RLS, widzi WSZYSTKIE workspaces

```typescript
// Obecne rozwiązanie - PROBLEMATYCZNE
await this.prisma.forUser(workspace.createdById, async (tx) => {
  // Używa ownera workspace'a jako kontekst - co jeśli owner opuści workspace?
});

// Alternatywa - JESZCZE GORZEJ
await this.prisma.withoutRls(async (tx) => {
  // Widzi WSZYSTKIE dane wszystkich workspaces!
});
```

### Dlaczego zmieniamy SPEC-001 po 3 dniach?

SPEC-001 rozwiązał problem **API request isolation** (user widzi tylko swoje workspaces). Ale nie przewidział:

1. **Background jobs** - scheduler nie ma user context
2. **System operations** - cron jobs, webhooks, migrations
3. **Performance** - JOIN przez `WorkspaceMember` w każdym query

## Decision

**Zmienić mechanizm context propagation z user-based na workspace-based.**

### Nowa architektura (workspace-based RLS)

```sql
CREATE POLICY document_select ON "Document"
  FOR SELECT
  USING ("workspaceId" = current_setting('app.current_workspace_id', true)::UUID);
```

### Kluczowe zmiany

1. **RLS policies** używają bezpośrednio `app.current_workspace_id`
2. **Middleware** weryfikuje membership PRZED ustawieniem context
3. **PrismaService.forWorkspace()** dla scheduler i system operations
4. **WorkspaceProcessingQueue** jako system table (bez RLS) dla routing

### Security Model

**Defense in depth:**

1. **Warstwa 1:** Middleware weryfikuje membership (`WorkspaceMember`)
2. **Warstwa 2:** RLS policies filtrują po `workspaceId`

Nawet jeśli middleware zawiedzie, RLS nadal blokuje dostęp (o ile `app.current_workspace_id` nie został ustawiony).

## Alternatives Considered

### Alt 1: Scheduler używa `withoutRls()` + explicit filter

```typescript
await prisma.withoutRls(async (tx) => {
  const docs = await tx.document.findMany({
    where: { workspaceId } // Explicit filter
  });
});
```

**Odrzucone:**
- `withoutRls()` widzi WSZYSTKIE dane (dangerous)
- Wymaga manualnego filtrowania (error-prone)
- Loguje WARNING (celowo, żeby odstraszyć)

### Alt 2: Scheduler używa `forUser(workspace.ownerId)`

```typescript
const owner = await getWorkspaceOwner(workspaceId);
await prisma.forUser(owner.id, async (tx) => {...});
```

**Odrzucone:**
- Scheduler nie powinien znać "właściciela" workspace'a
- Co jeśli owner opuści workspace?
- Semantycznie niepoprawne

### Alt 3: Dual context (user + workspace)

```sql
USING (
  "workspaceId" = current_setting('app.current_workspace_id')
  OR "workspaceId" IN (SELECT * FROM get_user_workspace_ids())
)
```

**Odrzucone:**
- Overcomplication - dwa mechanizmy do maintainowania
- Wydajność - nadal JOIN przez `WorkspaceMember`
- Trudniejsze do debugowania

### Alt 4: Osobna baza per workspace (database isolation)

**Odrzucone:**
- Ogromny overhead (każdy workspace = osobna baza)
- Komplikuje migrations, backupy, monitoring
- Overkill dla naszego scale

## Consequences

### Positive

1. **Prostsze RLS** - bezpośrednie porównanie `workspaceId`, bez funkcji SQL
2. **Scheduler semantycznie poprawny** - przetwarza workspace, nie user
3. **~15x lepsza wydajność** - brak JOIN w każdym query
4. **Defense in depth** - middleware + RLS

### Negative

1. **Breaking change** - wszystkie `forUser()` calls muszą być zmienione
2. **Middleware complexity** - musi weryfikować membership przed ustawieniem context
3. **Hybrid policies** - dla endpoints bez workspaceId (GET /workspaces) nadal potrzebny user context

### Risks

| Risk | Mitigation |
|------|------------|
| Middleware nie weryfikuje membership → RLS bypass | Integration test: alien workspace access returns 403 |
| SQL Injection via workspaceId | UUID validation + `::UUID` cast |
| Migration failure → inconsistent state | Atomic migration (BEGIN/COMMIT) + rollback script |

## Implementation

See: [SPEC: RLS Per-Workspace Refactor](../specifications/2025-12-28-rls-per-workspace-refactor.md)

### Migration Phases

1. **Faza 1-2:** Backwards compatible additions (`forWorkspace()`, `WorkspaceProcessingQueue`)
2. **Faza 3:** Atomic RLS policies migration
3. **Faza 4:** Code refactor (middleware, scheduler, services)
4. **Faza 5:** Cleanup (`forUser()` removal)

## Related

- [SPEC-001: Row Level Security](../specifications/SPEC-001-row-level-security.md) - original implementation
- [SPEC: RLS Per-Workspace Refactor](../specifications/2025-12-28-rls-per-workspace-refactor.md) - detailed spec
- [ADR-2025-12-28: Document Processing Cron](./ADR-2025-12-28-document-processing-cron-vs-queue.md) - scheduler that triggered this ADR

## Notes

### Why not extend SPEC-001?

SPEC-001 definiuje **user-based RLS** jako fundamentalne założenie. Ta zmiana to **architectural shift** - zasługuje na osobny ADR i osobną specyfikację.

### Future: Organization as tenant

Jeśli w przyszłości `Organization` stanie się unit of isolation (jeden billing dla wielu workspaces), RLS context może zostać rozszerzony:

```typescript
forOrganization(orgId, callback)  // Organization context
forWorkspace(workspaceId, callback)  // Workspace context (nested)
```

Obecny design to umożliwia bez breaking changes.
