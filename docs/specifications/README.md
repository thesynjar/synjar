# Synjar - Specyfikacje MVP

Ten katalog zawiera granularne specyfikacje dla Synjar, zaprojektowane do iteracyjnej implementacji.

## Przegląd

| # | Specyfikacja | Priorytet | Złożoność | Status |
|---|--------------|-----------|-----------|--------|
| 001 | [Row Level Security](./SPEC-001-row-level-security.md) | P0 | M | Draft |
| 006 | [Usage Tracking](./SPEC-006-usage-tracking.md) | P1 | M | Draft |
| 007 | [Fixed-size Chunking](./SPEC-007-fixed-size-chunking.md) | P1 | M | Draft |
| 008 | [Chunking Strategy Selection](./SPEC-008-chunking-strategy-selection.md) | P1 | S | Draft |
| 009 | [Conflict Auditor (PREMIUM)](./SPEC-009-conflict-auditor.md) | P2 | L | Draft |
| 010 | [Verified Recommendations (PREMIUM)](./SPEC-010-verified-recommendations.md) | P2 | M | Draft |
| 011 | [Frontend - Auth](./SPEC-011-frontend-auth.md) | P0 | M | Draft |
| 012 | [Frontend - Dashboard](./SPEC-012-frontend-dashboard.md) | P0 | M | Draft |
| 013 | [Frontend - Documents](./SPEC-013-frontend-documents.md) | P0 | L | Draft |
| 014 | [Frontend - Markdown Editor](./SPEC-014-frontend-markdown-editor.md) | P1 | M | Draft |
| 015 | [Frontend - Search](./SPEC-015-frontend-search.md) | P1 | M | Draft |
| 016 | [Frontend - Public Links](./SPEC-016-frontend-public-links.md) | P1 | M | Draft |

> **Note:** SPEC-003 (Workspace Limit), SPEC-004 (Document Limit), SPEC-005 (Storage Limit) przeniesione do repozytorium enterprise.

## Priorytety

- **P0** - Fundament, wymagane do MVP
- **P1** - Core features, ważne dla UX
- **P2** - Premium features, opcjonalne dla MVP

## Złożoność

- **S** - Small (1-2 dni)
- **M** - Medium (2-4 dni)
- **L** - Large (4-7 dni)

## Rekomendowana kolejność implementacji

### Faza 1: Fundamenty (Backend)

```
SPEC-001 (RLS)
    ↓
SPEC-006 (Usage Tracking) - opcjonalne, zależne od enterprise
```

> **Uwaga:** SPEC-003/004/005 (limity) oraz Plan/Subscription Model są w repozytorium enterprise.

### Faza 2: Frontend Core

```
SPEC-011 (Auth)
    ↓
SPEC-012 (Dashboard)
    ↓
SPEC-013 (Documents)
```

### Faza 3: Chunking

```
SPEC-007 (Fixed-size Chunking)
    ↓
SPEC-008 (Strategy Selection)
```

### Faza 4: Frontend Features

```
┌─────────────────────────────────────┐
│ SPEC-014     │ SPEC-015 │ SPEC-016 │  (równolegle)
│ Markdown     │ Search   │ Public   │
│ Editor       │          │ Links    │
└─────────────────────────────────────┘
```

### Faza 5: Premium Features (opcjonalnie)

```
SPEC-009 (Conflict Auditor)
    ↓
SPEC-010 (Recommendations)
```

## Zależności między specyfikacjami

```
┌──────────────────────────────────────┐
│           SPEC-001 (RLS)             │
│         (Fundament bezpieczeństwa)   │
└───────────────┬──────────────────────┘
                │
    ┌───────────┴───────────┐
    │                       │
    ▼                       ▼
┌─────────────────┐   ┌─────────────────┐
│    SPEC-007     │   │    SPEC-006     │
│ Fixed Chunking  │   │  Usage Tracking │
└────────┬────────┘   └─────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐   ┌─────────────────────┐
│    SPEC-008     │   │ Enterprise: Limity  │
│ Strategy Select │   │ SPEC-003/004/005    │
└─────────────────┘   └─────────────────────┘

Premium Features:
┌─────────────────┐     ┌─────────────────┐
│    SPEC-009     │     │    SPEC-010     │
│ Conflict Audit  │     │ Recommendations │
└─────────────────┘     └─────────────────┘
```

> SPEC-003/004/005 (limity) przeniesione do repozytorium enterprise


                        FRONTEND FLOW

┌─────────────────┐
│   SPEC-011      │
│     Auth        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   SPEC-012      │
│   Dashboard     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   SPEC-013      │
│   Documents     │
└────────┬────────┘
         │
    ┌────┴────┬─────────────┐
    │         │             │
    ▼         ▼             ▼
┌───────┐ ┌───────┐   ┌───────────┐
│SPEC-14│ │SPEC-15│   │  SPEC-16  │
│Markdown│ │Search │   │Pub. Links │
└───────┘ └───────┘   └───────────┘
```

## Plany i limity

| Plan | Workspaces | Docs/WS | File Size | Storage | Chunking | Conflicts | Recommendations |
|------|------------|---------|-----------|---------|----------|-----------|-----------------|
| FREE | 1 | 100 | 50 MB | 100 MB | Fixed | ❌ | ❌ |
| STARTER | 3 | 500 | 100 MB | 500 MB | Smart | ❌ | ❌ |
| BASIC | 5 | 1,000 | 100 MB | 1 GB | Smart | ✅ | ❌ |
| PRO | 10 | 5,000 | 200 MB | 2 GB | Smart | ✅ | ✅ |
| BUSINESS | ∞ | ∞ | 500 MB | 5 GB | Smart | ✅ | ✅ |

## Konwencje

Każda specyfikacja zawiera:

1. **Cel biznesowy** - dlaczego to robimy
2. **Wymagania funkcjonalne** - co dokładnie implementujemy
3. **Model danych** - zmiany w schemacie (jeśli są)
4. **API** - endpointy i DTOs (jeśli są)
5. **Implementacja** - kluczowe fragmenty kodu
6. **Testy akceptacyjne** - scenariusze Gherkin
7. **Definition of Done** - checklist ukończenia
8. **Estymacja** - złożoność zadań

## Słownik

| Termin | Opis |
|--------|------|
| RLS | Row Level Security - izolacja danych na poziomie PostgreSQL |
| Chunk | Fragment dokumentu z embeddingiem do wyszukiwania |
| Embedding | Wektor 1536-wymiarowy reprezentujący semantykę tekstu |
| Smart Chunking | Dzielenie dokumentu przez LLM na semantyczne części |
| Fixed-size Chunking | Dzielenie programistyczne po ~500 tokenów z overlap |
| Public Link | Token umożliwiający dostęp do bazy wiedzy bez auth |
| Verified | Dokument zweryfikowany jako wiarygodne źródło |
| Unverified | Dokument niezweryfikowany (email, draft, LLM output) |
