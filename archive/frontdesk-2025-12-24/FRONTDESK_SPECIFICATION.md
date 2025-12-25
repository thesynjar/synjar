# Frontdesk - Specyfikacja Systemu

**Wersja:** 1.0
**Data:** 2025-12-23
**Autor:** Michał Kukla + Claude

---

## 1. Wizja Produktu

### 1.1 Opis

**Frontdesk** to modułowy system helpdesk + CRM zaprojektowany dla branży hotelarskiej, ale możliwy do adaptacji dla innych branż. System agreguje komunikację z klientami z różnych kanałów w jednym miejscu, integruje się z systemami rezerwacyjnymi (PMS) i wspiera operatora asystentem AI.

### 1.2 Kluczowe Założenia

1. **Modularność** - każdy moduł (bounded context) może działać niezależnie
2. **Agnostyczność** - system nie jest zależny od konkretnego LLM czy bazy wiedzy
3. **Operator-first** - AI wspiera operatora, nie zastępuje go
4. **Pełen kontekst** - wszystkie informacje o kliencie w jednym miejscu

### 1.3 Główne Przypadki Użycia

1. Recepcjonista odpowiada na zapytanie gościa (email/WhatsApp)
2. Recepcjonista sprawdza historię rezerwacji klienta
3. AI sugeruje odpowiedź na podstawie bazy wiedzy
4. Recepcjonista poprawia odpowiedź AI i uczy system
5. Manager przegląda bazę wiedzy i aktualizuje informacje

---

## 2. Architektura Modułowa (Bounded Contexts)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTDESK SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   INBOX         │  │   CRM           │  │   KNOWLEDGE     │              │
│  │   (Helpdesk)    │  │   (Customers)   │  │   BASE          │              │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤              │
│  │ • Conversations │  │ • Accounts      │  │ • Articles      │              │
│  │ • Messages      │  │ • Identifiers   │  │ • FAQ           │              │
│  │ • Threads       │  │ • Preferences   │  │ • Policies      │              │
│  │ • Tags          │  │ • Notes         │  │ • Verified/Draft│              │
│  │ • Assignments   │  │ • Segments      │  │ • Categories    │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
│           └────────────────────┼────────────────────┘                        │
│                                │                                             │
│                    ┌───────────┴───────────┐                                │
│                    │      AI ASSISTANT     │                                │
│                    │        (Kora)         │                                │
│                    ├───────────────────────┤                                │
│                    │ • Draft responses     │                                │
│                    │ • Context retrieval   │                                │
│                    │ • Learning from       │                                │
│                    │   corrections         │                                │
│                    └───────────────────────┘                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        INTEGRATIONS                                  │    │
│  ├─────────────────┬─────────────────┬─────────────────┬───────────────┤    │
│  │   PMS           │   Email         │   WhatsApp      │   Other       │    │
│  │   (Rezerwacje)  │   (IMAP/SMTP)   │   (API)         │   Channels    │    │
│  └─────────────────┴─────────────────┴─────────────────┴───────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Moduły Szczegółowo

### 3.1 INBOX (Helpdesk)

**Odpowiedzialność:** Zarządzanie komunikacją z klientami

**Encje:**
```
Conversation (Wątek/Konwersacja)
├── id: UUID
├── account_id: UUID (powiązanie z CRM)
├── channel: email | whatsapp | phone | messenger | webchat
├── subject: string
├── status: open | pending | resolved | closed
├── priority: low | normal | high | urgent
├── assigned_to: UUID (operator)
├── tags: string[]
├── created_at: timestamp
├── updated_at: timestamp
└── messages: Message[]

Message (Wiadomość)
├── id: UUID
├── conversation_id: UUID
├── direction: inbound | outbound
├── sender_identifier: string (email, phone, etc.)
├── content: text
├── content_html: text (dla email)
├── attachments: Attachment[]
├── metadata: JSON (headers, etc.)
├── status: received | draft | sent | failed
├── ai_generated: boolean
├── ai_edited: boolean
├── created_at: timestamp
└── sent_at: timestamp

Attachment
├── id: UUID
├── message_id: UUID
├── filename: string
├── mime_type: string
├── size_bytes: integer
├── storage_path: string
└── summary: text (AI-generated dla kontekstu)
```

**Funkcjonalności:**
- Odbieranie wiadomości z kanałów (email, WhatsApp, etc.)
- Grupowanie w wątki (threading)
- Tagowanie wiadomości i wątków
- Przypisywanie do operatorów
- Statusy i priorytety
- Historia pełnej konwersacji

---

### 3.2 CRM (Customers)

**Odpowiedzialność:** Zarządzanie danymi klientów

**Encje:**
```
Account (Konto klienta)
├── id: UUID
├── display_name: string
├── type: individual | company
├── status: active | inactive | vip | blacklisted
├── notes: text
├── custom_fields: JSON
├── created_at: timestamp
├── updated_at: timestamp
├── identifiers: Identifier[]
├── preferences: Preference[]
└── tags: string[]

Identifier (Identyfikator kontaktowy)
├── id: UUID
├── account_id: UUID
├── channel: email | phone | whatsapp | messenger | facebook
├── value: string (email address, phone number, etc.)
├── is_primary: boolean
├── is_verified: boolean
├── label: string (personal, work, etc.)
└── created_at: timestamp

Preference (Preferencja klienta)
├── id: UUID
├── account_id: UUID
├── category: string (room, food, communication, etc.)
├── key: string
├── value: string
├── source: manual | inferred | pms
├── confidence: float (dla inferred)
└── updated_at: timestamp

Note (Notatka o kliencie)
├── id: UUID
├── account_id: UUID
├── content: text
├── created_by: UUID (operator)
├── pinned: boolean
└── created_at: timestamp
```

**Funkcjonalności:**
- Unified customer view (wszystkie identyfikatory w jednym koncie)
- Automatyczne łączenie identyfikatorów (merging)
- Preferencje klienta (manualne i wykryte przez AI)
- Notatki operatorów
- Segmentacja i tagowanie
- Historia interakcji

---

### 3.3 KNOWLEDGE BASE

**Odpowiedzialność:** Zarządzanie bazą wiedzy hotelu

**Encje:**
```
Article (Artykuł wiedzy)
├── id: UUID
├── workspace_id: UUID (dla multi-tenant)
├── title: string
├── content: text (markdown)
├── category: string
├── tags: string[]
├── status: draft | pending_review | verified | archived
├── confidence: float (1.0 dla verified)
├── source: manual | extracted | learned
├── source_reference: string (skąd pochodzi)
├── valid_from: date
├── valid_until: date
├── created_by: UUID
├── verified_by: UUID
├── created_at: timestamp
├── updated_at: timestamp
└── chunks: Chunk[]

Chunk (Fragment do RAG)
├── id: UUID
├── article_id: UUID
├── content: text
├── embedding_id: string (ID w vector DB)
├── token_count: integer
└── metadata: JSON

Category (Kategoria)
├── id: UUID
├── name: string
├── slug: string
├── parent_id: UUID (hierarchia)
├── description: text
└── icon: string
```

**Funkcjonalności:**
- CRUD artykułów
- Workflow weryfikacji (draft → verified)
- Kategoryzacja i tagowanie
- Wersjonowanie (historia zmian)
- RAG search (embeddingi)
- Import/eksport

---

### 3.4 AI ASSISTANT (Kora)

**Odpowiedzialność:** Wsparcie operatora w odpowiadaniu

**Tryby pracy:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRYBY PRACY AI                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TRYB 1: DRAFT (domyślny)                                       │
│  ├── AI analizuje wiadomość                                     │
│  ├── Pobiera kontekst (klient, rezerwacje, wiedza)              │
│  ├── Generuje propozycję odpowiedzi                             │
│  ├── Operator edytuje i zatwierdza                              │
│  └── System uczy się z poprawek                                 │
│                                                                  │
│  TRYB 2: AUTONOMOUS (za zgodą operatora)                        │
│  ├── AI odpowiada automatycznie na proste pytania               │
│  ├── Przedstawia się jako asystent AI                           │
│  ├── Podaje linki do bazy wiedzy                                │
│  ├── Eskaluje do człowieka gdy niepewny                         │
│  └── Operator może przejąć w każdej chwili                      │
│                                                                  │
│  TRYB 3: COPILOT (w tle)                                        │
│  ├── Nie generuje odpowiedzi                                    │
│  ├── Podpowiada relevantne artykuły                            │
│  ├── Wyświetla kontekst klienta                                 │
│  └── Sugeruje tagi i kategorie                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Encje:**
```
AIInteraction (Interakcja z AI)
├── id: UUID
├── conversation_id: UUID
├── message_id: UUID (wiadomość klienta)
├── mode: draft | autonomous | copilot
├── generated_response: text
├── final_response: text (po edycji operatora)
├── was_edited: boolean
├── edit_diff: text (co zmieniono)
├── context_used: JSON (jakie źródła użyto)
├── feedback: positive | negative | null
├── created_at: timestamp
└── operator_id: UUID

LearningEntry (Wpis do uczenia)
├── id: UUID
├── type: correction | new_pattern | feedback
├── original_response: text
├── corrected_response: text
├── context: JSON
├── applied_to_knowledge_base: boolean
├── created_at: timestamp
└── reviewed_by: UUID
```

**Funkcjonalności:**
- Generowanie draftu odpowiedzi
- Pobieranie kontekstu (RAG + CRM + PMS)
- Uczenie się z poprawek operatora
- Sugestie artykułów z bazy wiedzy
- Autonomiczne odpowiadanie (opcjonalne)

---

### 3.5 INTEGRATIONS

#### 3.5.1 PMS Integration (Property Management System)

**Odpowiedzialność:** Synchronizacja danych rezerwacyjnych

**Dane pobierane z PMS:**
```
Reservation (Rezerwacja)
├── external_id: string (ID w PMS)
├── account_id: UUID (matched przez email/telefon)
├── status: confirmed | checked_in | checked_out | cancelled | no_show
├── check_in: date
├── check_out: date
├── rooms: Room[]
├── guests_count: integer
├── total_amount: decimal
├── currency: string
├── payment_status: pending | partial | paid | refunded
├── special_requests: text
├── source: direct | booking | expedia | etc.
├── created_at: timestamp
└── updated_at: timestamp

Room
├── room_number: string
├── room_type: string
├── rate_name: string
├── price_per_night: decimal
└── guests: Guest[]
```

**Integracje wspierane:**
- Clock PMS
- Mews
- Opera
- Protel
- Custom API

**Mechanizm:**
- Webhook z PMS przy zmianach
- Polling co X minut jako fallback
- Matching gościa po email/telefonie

---

#### 3.5.2 Channel Integrations

**Email:**
- IMAP dla odbierania
- SMTP dla wysyłania
- OAuth2 dla Gmail/Microsoft 365
- Webhook dla Mailgun/SendGrid

**WhatsApp:**
- WhatsApp Business API
- Twilio
- 360dialog

**Inne:**
- Facebook Messenger
- Instagram DM
- SMS (Twilio)
- Webchat (własny widget)

---

## 4. Przepływy Danych (Data Flows)

### 4.1 Nowa Wiadomość Przychodzi

```
┌──────────────┐
│   Channel    │
│ (Email/WA)   │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 1. INBOX: Odbierz wiadomość                                      │
│    • Parse content (text, HTML, attachments)                     │
│    • Znajdź lub utwórz Conversation (threading)                  │
│    • Zapisz Message                                              │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. CRM: Identyfikuj klienta                                      │
│    • Szukaj Account po identifier (email/phone)                  │
│    • Jeśli brak → utwórz nowy Account                           │
│    • Powiąż Conversation z Account                               │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. PMS: Pobierz rezerwacje (async)                               │
│    • Szukaj rezerwacji po email/telefonie                        │
│    • Cache wyników                                               │
│    • Powiąż z Account                                            │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. AI ASSISTANT: Przygotuj kontekst i draft (async)              │
│    • Zbierz: customer card, rezerwacje, historię konwersacji    │
│    • RAG: znajdź relevantne artykuły                            │
│    • Wygeneruj draft odpowiedzi                                  │
│    • Zapisz jako suggestion dla operatora                        │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. UI: Powiadom operatora                                        │
│    • Nowa wiadomość w Inbox                                      │
│    • Kontekst klienta gotowy                                     │
│    • Draft odpowiedzi gotowy                                     │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Operator Odpowiada

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. OPERATOR: Pisze odpowiedź                                     │
│    • Może użyć draftu AI                                         │
│    • Może edytować                                               │
│    • Może napisać własną                                         │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. INBOX: Zapisz i wyślij                                        │
│    • Utwórz Message (outbound)                                   │
│    • Wyślij przez Channel                                        │
│    • Zaktualizuj Conversation status                             │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. AI ASSISTANT: Ucz się (async)                                 │
│    • Jeśli draft był edytowany → zapisz diff                    │
│    • Analizuj pattern poprawek                                   │
│    • Opcjonalnie: zaproponuj update bazy wiedzy                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Wymagania Funkcjonalne

### 5.1 INBOX (Must Have)

- [ ] Odbieranie emaili (IMAP)
- [ ] Wysyłanie emaili (SMTP)
- [ ] Threading (grupowanie w wątki)
- [ ] Tagowanie wiadomości i wątków
- [ ] Statusy (open, pending, resolved, closed)
- [ ] Przypisywanie do operatorów
- [ ] Wyszukiwanie pełnotekstowe
- [ ] Filtrowanie po tagach, statusach, datach

### 5.2 CRM (Must Have)

- [ ] Unified customer view
- [ ] Łączenie identyfikatorów w jedno konto
- [ ] Notatki o kliencie
- [ ] Preferencje klienta (manual)
- [ ] Historia wszystkich interakcji
- [ ] Wyszukiwanie klientów

### 5.3 Knowledge Base (Must Have)

- [ ] CRUD artykułów (markdown)
- [ ] Kategoryzacja
- [ ] Status: draft vs verified
- [ ] Wyszukiwanie (pełnotekstowe + RAG)
- [ ] Wyświetlanie w kontekście konwersacji

### 5.4 AI Assistant (Must Have dla v1)

- [ ] Generowanie draftu odpowiedzi
- [ ] Pobieranie kontekstu klienta
- [ ] RAG search w bazie wiedzy
- [ ] Wyświetlanie sugestii artykułów

### 5.5 AI Assistant (Nice to Have dla v2+)

- [ ] Uczenie się z poprawek
- [ ] Tryb autonomiczny
- [ ] Wykrywanie preferencji klienta
- [ ] Proponowanie zmian w bazie wiedzy

### 5.6 PMS Integration (Must Have)

- [ ] Pobieranie rezerwacji po email/telefonie
- [ ] Wyświetlanie historii rezerwacji
- [ ] Wyświetlanie aktualnej rezerwacji
- [ ] Co najmniej jedna integracja (np. Clock PMS)

### 5.7 Channels (Phased)

- [ ] **v1:** Email (IMAP/SMTP)
- [ ] **v2:** WhatsApp Business
- [ ] **v3:** Facebook Messenger, Webchat

---

## 6. Wymagania Niefunkcjonalne

### 6.1 Performance

- Wiadomość widoczna w UI < 2s od otrzymania
- Wyszukiwanie < 500ms
- Draft AI gotowy < 5s od otrzymania wiadomości

### 6.2 Skalowalność

- Obsługa 100+ konwersacji dziennie
- 10,000+ artykułów w bazie wiedzy
- 50,000+ klientów w CRM

### 6.3 Bezpieczeństwo

- Szyfrowanie danych w spoczynku
- HTTPS dla wszystkich połączeń
- RBAC (role-based access control)
- Audit log wszystkich akcji

### 6.4 Multi-tenancy

- Izolacja danych między hotelami
- Osobne workspace'y
- White-label możliwy

---

## 7. Tech Stack (Propozycja)

### Backend
```
Language:       Python 3.11+
Framework:      FastAPI
Database:       PostgreSQL 15+
Vector DB:      Qdrant (self-hosted)
Cache:          Redis
Queue:          Redis + Celery
Email:          IMAP/SMTP + python-imap
Search:         PostgreSQL FTS + Qdrant
```

### Frontend
```
Framework:      Next.js 14+ (React)
UI Library:     Tailwind CSS + shadcn/ui
State:          Zustand or React Query
Real-time:      WebSockets (Socket.io)
```

### Infrastructure
```
Container:      Docker + docker-compose
Orchestration:  Kubernetes (production)
CI/CD:          GitHub Actions
Monitoring:     Prometheus + Grafana
Logging:        Loki or ELK
```

---

## 8. API Design (High-Level)

### 8.1 REST Endpoints

```
# Inbox
GET     /api/v1/conversations
GET     /api/v1/conversations/{id}
POST    /api/v1/conversations/{id}/messages
PUT     /api/v1/conversations/{id}/status
PUT     /api/v1/conversations/{id}/assign
POST    /api/v1/conversations/{id}/tags

# CRM
GET     /api/v1/accounts
GET     /api/v1/accounts/{id}
PUT     /api/v1/accounts/{id}
POST    /api/v1/accounts/{id}/identifiers
POST    /api/v1/accounts/{id}/notes
GET     /api/v1/accounts/{id}/conversations
GET     /api/v1/accounts/{id}/reservations

# Knowledge Base
GET     /api/v1/articles
GET     /api/v1/articles/{id}
POST    /api/v1/articles
PUT     /api/v1/articles/{id}
POST    /api/v1/articles/{id}/verify
GET     /api/v1/search?q={query}

# AI Assistant
POST    /api/v1/ai/generate-draft
POST    /api/v1/ai/suggest-articles
POST    /api/v1/ai/feedback
GET     /api/v1/ai/context/{conversation_id}

# Integrations
GET     /api/v1/pms/reservations?email={email}
POST    /api/v1/webhooks/email
POST    /api/v1/webhooks/whatsapp
```

### 8.2 WebSocket Events

```
# Inbox real-time
conversation:new
conversation:updated
message:new
message:sent

# AI real-time
ai:draft-ready
ai:suggestions-ready

# Typing indicators
conversation:typing
```

---

## 9. Podsumowanie Wymagań

### Co budujemy:

1. **Helpdesk** (Inbox) - zarządzanie komunikacją
2. **CRM** - zarządzanie klientami
3. **Knowledge Base** - baza wiedzy z RAG
4. **AI Assistant** - wsparcie dla operatora
5. **Integracje** - PMS, kanały komunikacji

### Kolejność budowania (propozycja):

1. **MVP (4-6 tyg):** Inbox (email) + CRM basic + KB basic
2. **v1.0 (4-6 tyg):** AI draft + PMS integration + KB verified
3. **v1.5 (4-6 tyg):** WhatsApp + AI learning + KB advanced
4. **v2.0 (ongoing):** Autonomiczny AI + więcej kanałów + analytics

---

## 10. Otwarte Pytania

1. **Nazwa produktu?** Frontdesk? Kora? Inna?
2. **Pierwszy PMS do integracji?** Clock PMS? Mews?
3. **Hosting?** Self-hosted? Cloud? Hybrid?
4. **Licencja?** Open source? Proprietary? Dual license?
5. **Pricing model?** Per-seat? Per-conversation? Flat fee?
