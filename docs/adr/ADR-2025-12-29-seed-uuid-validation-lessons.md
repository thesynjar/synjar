# ADR-2025-12-29: Seed Script UUID Validation - Lessons Learned

## Status

**Accepted**

## Context

### Incydent

Po wdrożeniu specyfikacji `2025-12-28-rls-per-workspace-refactor.md` (commit `9b3776f`), aplikacja przestała działać z błędem:

```
WORKSPACE_CONTEXT_INVALID_UUID
workspaceId: "dev-general-workspace"
```

### Przyczyna

1. **Nowa walidacja UUID** została dodana w `PrismaService.forWorkspace()`:
   ```typescript
   if (!isUUID(workspaceId)) {
     throw new BadRequestException('Invalid workspace ID format');
   }
   ```

2. **Seed script nie został zaktualizowany** - nadal tworzył workspace z `id: 'dev-general-workspace'` (string slug zamiast UUID)

3. **Seed używa bezpośrednio `PrismaClient`**, nie `PrismaService`, więc omija walidację aplikacyjną

### Dlaczego nie wykryto wcześniej?

- Brak testu integracyjnego sprawdzającego seed + API workflow
- Manual testing nie obejmował pełnego `db:reset` + sprawdzenia UI
- Specyfikacja nie zawierała checklisty "update seed if needed"

## Decision

### 1. Seed script musi używać UUID

```typescript
// PRZED (błędne)
const workspace = await prisma.workspace.upsert({
  where: { id: 'dev-general-workspace' },
  create: { id: 'dev-general-workspace', ... }
});

// PO (poprawne)
const DEV_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const workspace = await prisma.workspace.upsert({
  where: { id: DEV_WORKSPACE_ID },
  create: { id: DEV_WORKSPACE_ID, ... }
});
```

### 2. Stałe UUID dla dev environment

Używamy deterministycznych UUID dla reproducibility:
- `00000000-0000-4000-8000-000000000001` - Dev workspace

### 3. Checklist dla specyfikacji zmieniających walidację

Każda specyfikacja dodająca/zmieniająca walidację MUSI zawierać sekcję:

```markdown
## Seed & Test Data Impact

- [ ] Sprawdź czy seed.ts wymaga aktualizacji
- [ ] Sprawdź czy fixtures wymagają aktualizacji
- [ ] Uruchom `db:reset` + manual test po zmianach
```

## Consequences

### Positive

- Seed script jest teraz zgodny z walidacją UUID
- Deterministyczne UUID ułatwiają debugging
- Lessons learned udokumentowane dla przyszłych zmian

### Negative

- Jednorazowa migracja danych deweloperskich (db:reset)

### Risks

- Inne miejsca w kodzie mogą zakładać format slug (sprawdzone - brak)

## Implementation

- [x] Zaktualizować `prisma/seed.ts` - użyć UUID
- [x] Uruchomić `db:reset` na środowisku deweloperskim
- [ ] Dodać do template specyfikacji sekcję "Seed & Test Data Impact"

## Related

- Spec: `2025-12-28-rls-per-workspace-refactor.md`
- Commit: `9b3776f` (feat: workspace-based RLS)
