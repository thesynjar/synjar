# Code Review - Post-Implementation Verification

Wykonaj kompleksowy code review zmian wprowadzonych w tej konwersacji.

## Krok 1: Przygotowanie kontekstu

1. Przeczytaj CLAUDE.md i docs/README.md
2. Jeśli z konwersacji nie wynika, znajdź najnowszą specyfikację w docs/specifications/ (sortuj po dacie w nazwie)
3. Pobierz listę zmienionych plików:
   ```bash
   git status
   git diff --name-only HEAD~1
   ```

## Krok 2: Uruchom agentów-ekspertów RÓWNOLEGLE

Użyj narzędzia Task aby uruchomić agentów jednocześnie (w jednej wiadomości).

**Każdy agent automatycznie zapisuje swój raport do `docs/agents/[nazwa-agenta]/reports/YYYY-MM-DD-HH-ii-[typ]-review.md`**

**Zawsze uruchamiaj 5 podstawowych agentów:**

### Agent 1: security-reviewer

Sprawdza: OWASP Top 10, injection, XSS, credential leaks, walidację inputów

### Agent 2: architecture-reviewer

Sprawdza: DDD (agregaty, VO, eventy), SOLID, warstwy, enterprise patterns, zgodność z ADR

### Agent 3: test-reviewer

Sprawdza: pokrycie testami, jakość testów, czy testy przechodzą, TDD/BDD

### Agent 4: code-quality-reviewer

Sprawdza: kompilację, Clean Code, code smells, linter, nazewnictwo

### Agent 5: documentation-reviewer

Sprawdza: specyfikację, docs/, README, ADR, aktualność dokumentacji, sugestie ulepszeń

**Warunkowo uruchamiaj dodatkowych agentów:**

### Agent 6: migration-reviewer (jeśli są zmiany w schema/migrations)

```bash
git diff --name-only HEAD~1 | grep -E "schema.prisma|migrations"
```

Jeśli wynik nie jest pusty → uruchom tego agenta.
Sprawdza: bezpieczeństwo migracji, utrata danych, breaking changes, multi-tenancy

### Agent 7: ux-reviewer (jeśli są zmiany w frontend lub API contracts)

```bash
git diff --name-only HEAD~1 | grep -E "apps/web/|\.tsx$|\.dto\.ts$|controller\.ts$"
```

Jeśli wynik nie jest pusty → uruchom tego agenta.
Sprawdza: zgodność ze specyfikacją UX, usability, accessibility, spójność UI, kontrakt API vs potrzeby frontendu

### Agent 8: user-docs-reviewer (jeśli są zmiany w UI lub API)

```bash
git diff --name-only HEAD~1 | grep -E "\.tsx$|\.dto\.ts$|controller\.ts$|\.controller\.ts$"
```

Jeśli wynik nie jest pusty → uruchom tego agenta.
Sprawdza:
- Czy istnieje user guide w `apps/user-docs/docs/` dla nowej funkcji
- Czy DTOs mają kompletne `@ApiProperty()` z opisami
- Czy Storybook stories istnieją dla nowych komponentów UI
- Czy changelog (`apps/user-docs/docs/changelog.md`) został zaktualizowany
- Czy screenshoty są aktualne (jeśli UI się zmieniło)
- **Czy dokumentowane funkcje mają pokrycie w testach E2E** (CRITICAL):
  - Dla każdego skrótu klawiszowego w docs → sprawdź test w `apps/web/e2e/`
  - Dla każdego user flow w docs → sprawdź odpowiedni test E2E
  - Dla każdego endpointu w API docs → sprawdź test w `apps/api/test/`
  - Jeśli brak testu → zgłoś jako 🔴 CRITICAL (nie dokumentujemy nieprzetestowanych funkcji)

**Raport zapisuje do:** `docs/agents/user-docs-reviewer/reports/YYYY-MM-DD-HH-ii-[typ]-review.md`

## Krok 3: Agregacja wyników

Po otrzymaniu wyników od wszystkich agentów, przedstaw SKONSOLIDOWANY RAPORT:

```markdown
# 📋 Code Review Report

## Podsumowanie

- 🔴 Critical: X issues
- 🟠 High: X issues
- 🟡 Medium: X issues
- 🟢 Low: X issues

## Status kontroli

| Obszar        | Status       | Uwagi |
| ------------- | ------------ | ----- |
| Security      | ✅/⚠️/❌     |       |
| Architecture  | ✅/⚠️/❌     |       |
| Tests         | ✅/⚠️/❌     |       |
| Code Quality  | ✅/⚠️/❌     |       |
| Documentation | ✅/⚠️/❌     |       |
| Migrations    | ✅/⚠️/❌/N/A |       |
| UX            | ✅/⚠️/❌/N/A |       |
| User Docs     | ✅/⚠️/❌/N/A |       |

## 🔴 CRITICAL (blokuje deploy)

[zagregowane z wszystkich agentów]

## 🟠 HIGH (naprawić przed merge)

[zagregowane z wszystkich agentów]

## 🟡 MEDIUM (do następnej iteracji)

[zagregowane z wszystkich agentów]

## 🟢 LOW (nice to have)

[zagregowane z wszystkich agentów]

## ✅ Co jest dobrze

[pozytywne aspekty z każdego obszaru]

## 📝 Rekomendowane akcje

1. [akcja - priorytet]
2. [akcja - priorytet]
   ...
```

## Krok 4: Aktualizacja specyfikacji

Po agregacji wyników uruchom agenta `specification-updater`:

```
Użyj agenta specification-updater aby:
1. Przeczytać wszystkie raporty z docs/agents/*/reports/
2. Znaleźć lub utworzyć specyfikację
3. Uzupełnić specyfikację o wszystkie zadania do wykonania
```

Agent utworzy/zaktualizuje specyfikację w `docs/specifications/YYYY-MM-DD-HH-ii-review-findings.md` z wszystkimi zadaniami pogrupowanymi wg priorytetów.

## Ważne zasady

- Każdy agent analizuje zmiany W KONTEKŚCIE CAŁEGO SYSTEMU
- Każdy agent zapisuje raport do `docs/agents/[nazwa-agenta]/reports/`
- Jeśli agent znajdzie problem w innym miejscu niż bieżące zmiany - też go zgłoś
- Deduplikuj problemy jeśli kilku agentów wykryło to samo
- Priorytety: Critical > High > Medium > Low
- Critical i High MUSZĄ być rozwiązane przed merge
- Na koniec `specification-updater` tworzy/aktualizuje specyfikację z zadaniami
