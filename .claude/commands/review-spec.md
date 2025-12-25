# Specification Review - Pre-Implementation Verification

Wykonaj review specyfikacji PRZED rozpoczęciem implementacji.

## Cel

Upewnij się, że specyfikacja jest kompletna, spójna i zgodna z zasadami architektonicznymi projektu, zanim zostanie napisana choćby jedna linia kodu.

## Krok 1: Przygotowanie kontekstu

1. Przeczytaj CLAUDE.md i docs/README.md
2. Znajdź specyfikację do review:
   - Jeśli podano ścieżkę → użyj jej
   - Jeśli nie → znajdź najnowszą w docs/specifications/ (sortuj po dacie)
3. Przeczytaj powiązane dokumenty:
   - docs/ecosystem.md (bounded contexts)
   - Powiązane ADR z docs/adr/
   - README.md produktów, których dotyczy specyfikacja

## Krok 2: Uruchom agentów-ekspertów RÓWNOLEGLE

Użyj narzędzia Task aby uruchomić agentów jednocześnie (w jednej wiadomości).

**Każdy agent automatycznie zapisuje swój raport do `docs/agents/[nazwa-agenta]/reports/YYYY-MM-DD-HH-ii-spec-review.md`**

### Agent 1: architecture-reviewer

Prompt:
```
Review specyfikacji pod kątem architektury. Przeczytaj specyfikację i oceń:

1. **DDD Compliance:**
   - Czy bounded contexts są poprawnie zdefiniowane?
   - Czy agregaty mają jasno określone granice i invarianty?
   - Czy Value Objects są zidentyfikowane?
   - Czy Domain Events są zdefiniowane (past tense)?
   - Czy jest ACL dla integracji zewnętrznych?

2. **SOLID w designie:**
   - Czy komponenty mają pojedynczą odpowiedzialność?
   - Czy design jest otwarty na rozszerzenia?
   - Czy interfejsy są małe i fokusowane?

3. **Warstwy:**
   - Czy jasno rozdzielono Domain/Application/Infrastructure?
   - Czy domena nie ma zależności od infrastruktury?

4. **Zgodność z ekosystemem:**
   - Czy pasuje do istniejących bounded contexts (docs/ecosystem.md)?
   - Czy nie duplikuje funkcjonalności innych modułów?
   - Czy integracje są przez ACL?

5. **Enterprise Patterns:**
   - Czy użyto odpowiednich wzorców (Repository, Orchestrator, Factory)?
   - Czy są zdefiniowane strategie dla złożonej logiki?

Zapisz raport do docs/agents/architecture-reviewer/reports/
```

### Agent 2: security-reviewer

Prompt:
```
Review specyfikacji pod kątem bezpieczeństwa. Przeczytaj specyfikację i oceń:

1. **Authentication & Authorization:**
   - Czy zdefiniowano kto ma dostęp do funkcjonalności?
   - Czy multi-tenancy jest uwzględnione (RLS)?
   - Czy są role i permissions?

2. **Data Protection:**
   - Czy wrażliwe dane są zidentyfikowane?
   - Czy jest plan szyfrowania (at rest, in transit)?
   - Czy credentials są bezpiecznie przechowywane?

3. **Input Validation:**
   - Czy zdefiniowano walidację inputów?
   - Czy są limity (rate limiting, size limits)?

4. **OWASP Top 10:**
   - Czy design chroni przed injection?
   - Czy jest zabezpieczenie przed XSS/CSRF?
   - Czy są secure defaults?

5. **Audit & Compliance:**
   - Czy jest logging zdarzeń bezpieczeństwa?
   - Czy są wymagania compliance (GDPR, etc.)?

Zapisz raport do docs/agents/security-reviewer/reports/
```

### Agent 3: documentation-reviewer

Prompt:
```
Review specyfikacji pod kątem kompletności dokumentacji. Przeczytaj specyfikację i oceń:

1. **Struktura specyfikacji:**
   - Czy ma jasny cel i scope?
   - Czy są zdefiniowane user stories/requirements?
   - Czy są kryteria akceptacji?
   - Czy są zdefiniowane out-of-scope?

2. **Technical Design:**
   - Czy są diagramy (sekwencji, architektury)?
   - Czy API contracts są zdefiniowane?
   - Czy są przykłady request/response?
   - Czy schema DB jest opisana?

3. **Spójność z dokumentacją:**
   - Czy jest zgodna z docs/ecosystem.md?
   - Czy referencuje odpowiednie ADR?
   - Czy jest plan aktualizacji docs/ po implementacji?

4. **Kompletność:**
   - Czy są zdefiniowane edge cases?
   - Czy są error scenarios?
   - Czy są migration steps (jeśli potrzebne)?

5. **Czytelność:**
   - Czy jest zrozumiała bez dodatkowego kontekstu?
   - Czy terminologia jest spójna z domeną?

Zapisz raport do docs/agents/documentation-reviewer/reports/
```

### Agent 4: test-reviewer

Prompt:
```
Review specyfikacji pod kątem testowalności. Przeczytaj specyfikację i oceń:

1. **Test Strategy:**
   - Czy są zdefiniowane scenariusze testowe?
   - Czy są happy path i error scenarios?
   - Czy są edge cases?

2. **Testowalność designu:**
   - Czy komponenty są łatwe do mockowania?
   - Czy są jasne granice do unit testów?
   - Czy są zdefiniowane integration test points?

3. **Acceptance Criteria:**
   - Czy kryteria akceptacji są mierzalne?
   - Czy można je zautomatyzować?
   - Czy są Given-When-Then scenarios?

4. **Test Data:**
   - Czy są przykładowe dane testowe?
   - Czy są fixtures dla external APIs?

5. **Coverage expectations:**
   - Czy są zdefiniowane wymagania pokrycia?
   - Czy są krytyczne ścieżki do przetestowania?

Zapisz raport do docs/agents/test-reviewer/reports/
```

### Agent 5: ux-reviewer (jeśli specyfikacja dotyczy UI/API)

Sprawdź czy specyfikacja zawiera elementy UI lub API contracts. Jeśli tak, uruchom tego agenta.

Prompt:
```
Review specyfikacji pod kątem UX. Przeczytaj specyfikację i oceń:

1. **User Experience:**
   - Czy user journey jest zdefiniowany?
   - Czy są mockupy/wireframes?
   - Czy są zdefiniowane stany (loading, error, empty)?

2. **API Design:**
   - Czy API jest RESTful/consistent?
   - Czy nazewnictwo jest intuicyjne?
   - Czy pagination jest zdefiniowana?
   - Czy error responses są ustandaryzowane?

3. **Accessibility:**
   - Czy są wymagania a11y?
   - Czy są zdefiniowane keyboard interactions?

4. **Responsiveness:**
   - Czy są wymagania mobile/desktop?
   - Czy są breakpoints?

5. **Consistency:**
   - Czy używa istniejących komponentów UI?
   - Czy jest spójna z resztą aplikacji?

Zapisz raport do docs/agents/ux-reviewer/reports/
```

### Agent 6: migration-reviewer (jeśli specyfikacja zawiera zmiany DB)

Sprawdź czy specyfikacja zawiera zmiany w schemacie bazy danych. Jeśli tak, uruchom tego agenta.

Prompt:
```
Review specyfikacji pod kątem migracji DB. Przeczytaj specyfikację i oceń:

1. **Schema Changes:**
   - Czy zmiany są backwards compatible?
   - Czy są nullable fields dla nowych kolumn?
   - Czy są default values?

2. **Data Migration:**
   - Czy jest plan migracji istniejących danych?
   - Czy jest rollback strategy?
   - Czy jest backup plan?

3. **Multi-tenancy:**
   - Czy RLS jest uwzględnione?
   - Czy tenant_id jest na wszystkich tabelach?
   - Czy są odpowiednie indeksy?

4. **Performance:**
   - Czy są zdefiniowane indeksy?
   - Czy duże tabele są uwzględnione?
   - Czy jest plan dla zero-downtime migration?

5. **Timestamps:**
   - Czy wszystkie timestampy są "timestamp with time zone"?

Zapisz raport do docs/agents/migration-reviewer/reports/
```

## Krok 3: Agregacja wyników

Po otrzymaniu wyników od wszystkich agentów, przedstaw SKONSOLIDOWANY RAPORT:

```markdown
# 📋 Specification Review Report

## Specyfikacja: [nazwa pliku]

## Podsumowanie

- 🔴 Critical: X issues (blokuje implementację)
- 🟠 High: X issues (wymaga poprawy przed implementacją)
- 🟡 Medium: X issues (do doprecyzowania w trakcie)
- 🟢 Low: X issues (nice to have)

## Status kontroli

| Obszar        | Status       | Uwagi |
| ------------- | ------------ | ----- |
| Architecture  | ✅/⚠️/❌     |       |
| Security      | ✅/⚠️/❌     |       |
| Documentation | ✅/⚠️/❌     |       |
| Testability   | ✅/⚠️/❌     |       |
| UX            | ✅/⚠️/❌/N/A |       |
| Migrations    | ✅/⚠️/❌/N/A |       |

## 🔴 CRITICAL (blokuje implementację)

[zagregowane z wszystkich agentów]

## 🟠 HIGH (poprawić przed implementacją)

[zagregowane z wszystkich agentów]

## 🟡 MEDIUM (doprecyzować w trakcie)

[zagregowane z wszystkich agentów]

## 🟢 LOW (nice to have)

[zagregowane z wszystkich agentów]

## ✅ Co jest dobrze

[pozytywne aspekty specyfikacji]

## 📝 Wymagane zmiany w specyfikacji

1. [zmiana - priorytet]
2. [zmiana - priorytet]
   ...

## ❓ Pytania do wyjaśnienia

1. [pytanie]
2. [pytanie]
   ...
```

## Krok 4: Aktualizacja specyfikacji

Jeśli są CRITICAL lub HIGH issues:

1. Zaproponuj konkretne zmiany w specyfikacji
2. Po akceptacji użytkownika, zaktualizuj specyfikację
3. Dodaj sekcję "Review History" na końcu specyfikacji:

```markdown
## Review History

### YYYY-MM-DD - Pre-Implementation Review
- Reviewed by: Claude (architecture, security, documentation, test, ux, migration)
- Status: ✅ Approved / ⚠️ Approved with comments / ❌ Requires changes
- Findings: [link do raportów w docs/agents/]
```

## Ważne zasady

- Review specyfikacji PRZED implementacją oszczędza czas
- CRITICAL issues MUSZĄ być rozwiązane przed rozpoczęciem kodowania
- HIGH issues powinny być rozwiązane, ale można zacząć z jasnym planem
- Każdy agent analizuje specyfikację w kontekście całego ekosystemu
- Deduplikuj problemy jeśli kilku agentów wykryło to samo
- Zapisuj raporty do docs/agents/[nazwa-agenta]/reports/
