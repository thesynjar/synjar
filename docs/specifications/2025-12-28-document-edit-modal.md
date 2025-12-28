# SPEC-018: Document Edit Page

**Data:** 2025-12-28
**Status:** Draft
**Priorytet:** P1
**Zależności:** SPEC-013 (Frontend Documents)

---

## 1. Cel biznesowy

Umożliwienie edycji dokumentów w workspace z mechanizmem auto-save i blokadą edycji (edit lock), zapobiegającą konfliktom przy równoczesnej edycji.

### Wartość MVP

- Dedykowana podstrona edycji dokumentu (nie modal)
- Auto-save podczas pisania (debounced)
- Edit lock - blokada dokumentu podczas edycji przez użytkownika
- Prosty inline editor dla dokumentów TEXT
- Edycja metadanych dla dokumentów FILE

---

## 2. Wymagania funkcjonalne

### 2.1 Edycja dokumentów TEXT

| Pole | Opis |
|------|------|
| title | Tytuł dokumentu (wymagany, max 200 znaków) |
| content | Treść markdown w inline editorze (zmiana triggeruje reprocessing) |
| sourceDescription | Opis źródła (np. "Email od klienta") |
| verificationStatus | VERIFIED / UNVERIFIED |
| tags | Lista tagów |

### 2.2 Edycja dokumentów FILE

| Pole | Opis |
|------|------|
| title | Tytuł dokumentu (wymagany, max 200 znaków) |
| originalFilename | Nazwa wyświetlana pliku (wymagana, max 255 znaków, bez /\) |
| verificationStatus | VERIFIED / UNVERIFIED |
| tags | Lista tagów |

**Uwaga:** Content (extracted text) jest read-only dla FILE - wyświetlany jako preview.

### 2.3 UI Pattern - Podstrona edycji

**Route:** `/workspaces/:workspaceId/documents/:documentId/edit`

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ ← Back to Documents          [Saving...] [Lock status]  │
├─────────────────────────────────────────────────────────┤
│ Title: [___________________________]                     │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │                                                     │ │
│ │  [Inline Editor - textarea/contenteditable]         │ │
│ │  (tylko dla TEXT documents)                         │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Source: [_______________]  Status: ○ Verified ○ Unverified │
│ Tags: [tag1] [tag2] [+ Add tag]                         │
└─────────────────────────────────────────────────────────┘
```

### 2.4 Tworzenie dokumentu TEXT

**Route:** `/workspaces/:workspaceId/documents/new`

Ten sam layout co edycja - unified experience. Dokument tworzony przy pierwszym auto-save (draft).

---

## 3. Edit Lock Mechanism

### 3.1 Koncept

Gdy użytkownik otwiera dokument do edycji:
1. Backend ustawia `editLockedBy` (userId) i `editLockedUntil` (timestamp + 2 min)
2. Frontend co 30 sekund wywołuje heartbeat odświeżający lock
3. Inni użytkownicy widzą "Dokument edytowany przez X" i nie mogą edytować
4. Lock wygasa automatycznie po 2 minutach bez heartbeat (np. użytkownik zamknął kartę)

### 3.2 Nowe pola w modelu Document

```prisma
model Document {
  // ... existing fields ...

  editLockedBy      String?   @db.Uuid
  editLockedUntil   DateTime? @db.Timestamptz

  editLockedByUser  User?     @relation("DocumentEditLock", fields: [editLockedBy], references: [id])
}
```

### 3.3 API Endpoints

**Acquire lock:**
```
POST /workspaces/:workspaceId/documents/:documentId/lock
Response: { lockedUntil: "2025-12-28T17:30:00Z" }
Error 409: { error: "DOCUMENT_LOCKED", lockedBy: "user@example.com", lockedUntil: "..." }
```

**Refresh lock (heartbeat):**
```
PUT /workspaces/:workspaceId/documents/:documentId/lock
Response: { lockedUntil: "2025-12-28T17:32:00Z" }
```

**Release lock:**
```
DELETE /workspaces/:workspaceId/documents/:documentId/lock
Response: 204 No Content
```

### 3.4 Business Rules

- Lock duration: 2 minuty
- Heartbeat interval: 30 sekund
- Lock można przejąć po wygaśnięciu (editLockedUntil < now)
- Owner dokumentu może force-release lock innego użytkownika (future)

---

## 4. Auto-Save Mechanism

### 4.1 Koncept

- Debounced save: 2 sekundy po ostatniej zmianie
- Visual feedback: "Saving...", "Saved", "Error saving"
- Retry logic: 3 próby z exponential backoff
- Conflict detection: jeśli document.updatedAt != local.lastKnownUpdatedAt → conflict

### 4.2 API

**Auto-save (partial update):**
```
PATCH /workspaces/:workspaceId/documents/:documentId
Body: {
  title?: string,
  content?: string,
  lastKnownUpdatedAt: "2025-12-28T17:25:00Z"  // optimistic locking
}
Response: { updatedAt: "2025-12-28T17:25:05Z" }
Error 409: { error: "CONFLICT", serverUpdatedAt: "...", serverUpdatedBy: "..." }
```

### 4.3 Frontend State

```typescript
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

// Debounced save
useEffect(() => {
  const timer = setTimeout(() => {
    if (hasUnsavedChanges) {
      saveDocument();
    }
  }, 2000);
  return () => clearTimeout(timer);
}, [title, content, tags]);
```

### 4.4 Reprocessing

- Zmiana `content` dla TEXT documents triggeruje reprocessing
- Reprocessing jest async - nie blokuje auto-save
- UI pokazuje "Processing..." badge gdy processingStatus === PROCESSING

---

## 5. Zmiany w API

### 5.1 UpdateDocumentDto

```typescript
export class UpdateDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'Display filename for FILE documents' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[^/\\]*$/, { message: 'Filename cannot contain path separators' })
  originalFilename?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceDescription?: string;

  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'For optimistic locking / conflict detection' })
  @IsOptional()
  @IsDateString()
  lastKnownUpdatedAt?: string;
}
```

### 5.2 DocumentService.update - Walidacja

```typescript
// 1. Validate originalFilename for FILE documents
if (dto.originalFilename !== undefined) {
  if (document.contentType === ContentType.FILE && dto.originalFilename.trim() === '') {
    throw new BadRequestException('originalFilename cannot be empty for FILE documents');
  }
}

// 2. Reject content edit for FILE documents
if (dto.content !== undefined && document.contentType === ContentType.FILE) {
  throw new BadRequestException('Content is read-only for FILE documents');
}

// 3. Optimistic locking - conflict detection
if (dto.lastKnownUpdatedAt) {
  const lastKnown = new Date(dto.lastKnownUpdatedAt);
  if (document.updatedAt > lastKnown) {
    throw new ConflictException({
      error: 'CONFLICT',
      serverUpdatedAt: document.updatedAt,
      message: 'Document was modified by another user'
    });
  }
}
```

### 5.3 Rate Limiting

```typescript
// DocumentController
@Throttle({ default: { limit: 30, ttl: 60000 } })  // 30 req/min for auto-save
@Patch(':documentId')
async partialUpdate(...) { }
```

---

## 6. Komponenty Frontend

### 6.1 DocumentEditPage

**Route:** `/workspaces/:workspaceId/documents/:documentId/edit`

Główna strona edycji:
- Pobiera dokument przy mount
- Acquire lock przy mount, release przy unmount
- Heartbeat co 30s
- Auto-save z debounce 2s
- Keyboard: Ctrl+S = force save, Escape = back (z confirmation jeśli unsaved)

### 6.2 DocumentCreatePage

**Route:** `/workspaces/:workspaceId/documents/new`

Strona tworzenia nowego dokumentu TEXT:
- Tworzy draft przy pierwszym auto-save
- Po utworzeniu redirect do edit page z nowym ID

### 6.3 InlineEditor (prosty)

Prosty editor dla content:
- `<textarea>` z monospace font
- Placeholder: "Start typing your document..."
- Auto-resize (grow with content)
- Future: rozbudowa do rich text / markdown preview

### 6.4 SaveStatusIndicator

```
[Saving...] | [Saved ✓] | [Error - click to retry] | [Conflict - resolve]
```

### 6.5 LockStatusIndicator

```
[🔒 You are editing] | [🔒 Locked by user@example.com until 17:30]
```

### 6.6 Zmiany w DocumentRow

- Kliknięcie w wiersz → navigate to edit page (nie modal)
- Przycisk Edit → navigate to edit page
- Badge "Editing" gdy document.editLockedBy !== null

---

## 7. States & Feedback

### 7.1 Save States

| State | UI | Akcja |
|-------|-----|-------|
| idle | Nic | - |
| saving | "Saving..." spinner | - |
| saved | "Saved ✓" (fade out po 2s) | - |
| error | "Error saving" + retry button | Click → retry |
| conflict | "Conflict detected" + resolve button | Click → show diff/options |

### 7.2 Lock States

| State | UI | Akcja |
|-------|-----|-------|
| unlocked | - | Acquire lock |
| locked_by_me | "You are editing" | Heartbeat |
| locked_by_other | "Locked by X until Y" | Disable form, show message |
| lock_expired | - | Try to acquire |

### 7.3 Processing States

| State | UI |
|-------|-----|
| PENDING | "Queued for processing" |
| PROCESSING | "Processing..." spinner |
| COMPLETED | - |
| FAILED | "Processing failed: {error}" |

---

## 8. Keyboard Interactions

| Key | Action |
|-----|--------|
| Ctrl+S / Cmd+S | Force save now |
| Escape | Back to list (confirm if unsaved) |
| Tab | Navigate between form fields |

---

## 9. Accessibility (WCAG 2.1 Level A)

- Wszystkie pola mają `<label>` z `for` attribute
- Focus visible na wszystkich interactive elements
- `aria-live="polite"` dla save status announcements
- Escape key zamyka/wychodzi z confirmation
- Skip link do main content

---

## 10. Error Scenarios

| Scenario | HTTP | Message | UI Action |
|----------|------|---------|-----------|
| Document not found | 404 | "Document not found" | Redirect to list |
| Not workspace member | 403 | "Access denied" | Redirect to list |
| Document locked | 409 | "Document is being edited by X" | Show lock info, disable form |
| Conflict (optimistic lock) | 409 | "Document was modified" | Show conflict resolution |
| Empty originalFilename for FILE | 400 | "Filename is required" | Show field error |
| Content edit for FILE | 400 | "Content is read-only" | Should not happen (field hidden) |
| Network error | - | "Connection lost" | Retry with backoff |
| Rate limited | 429 | "Too many requests" | Wait and retry |

---

## 11. Database Migration

```prisma
// Nowe pola w Document
editLockedBy      String?   @db.Uuid
editLockedUntil   DateTime? @db.Timestamptz

// Relacja
editLockedByUser  User?     @relation("DocumentEditLock", fields: [editLockedBy], references: [id])

// Index dla query "find locked documents"
@@index([editLockedUntil])
```

**Migration jest backwards compatible** - nowe pola są nullable.

---

## 12. Definition of Done

### Backend
- [ ] Prisma migration: editLockedBy, editLockedUntil
- [ ] UpdateDocumentDto: originalFilename, lastKnownUpdatedAt, walidacje (@MaxLength, @Matches)
- [ ] DocumentService.update: walidacja originalFilename, content read-only dla FILE, conflict detection
- [ ] Lock endpoints: POST/PUT/DELETE /documents/:id/lock
- [ ] LockService: acquire, refresh, release, cleanup expired
- [ ] Rate limiting na PATCH endpoint (30 req/min)
- [ ] Testy jednostkowe (10+)

### Frontend
- [ ] Route: /workspaces/:id/documents/:id/edit
- [ ] Route: /workspaces/:id/documents/new
- [ ] DocumentEditPage z auto-save i lock management
- [ ] DocumentCreatePage (reuse edit page logic)
- [ ] InlineEditor (textarea, auto-resize)
- [ ] SaveStatusIndicator component
- [ ] LockStatusIndicator component
- [ ] Keyboard shortcuts (Ctrl+S, Escape)
- [ ] Accessibility: labels, aria-live, focus management
- [ ] DocumentRow: navigate to edit instead of modal

### Documentation
- [ ] Ta specyfikacja zaktualizowana
- [ ] API docs dla lock endpoints

---

## 13. Przypadki testowe

### Backend Unit Tests

| # | Scenariusz | Oczekiwany rezultat |
|---|------------|---------------------|
| 1 | Update title dokumentu TEXT | 200 OK, title zmieniony |
| 2 | Update content dokumentu TEXT | 200 OK, processingStatus = PENDING |
| 3 | Update content dokumentu FILE | 400 Bad Request |
| 4 | Empty originalFilename dla FILE | 400 Bad Request |
| 5 | Empty originalFilename dla TEXT | 200 OK (nullable) |
| 6 | originalFilename z "/" | 400 Bad Request (path separator) |
| 7 | title > 200 znaków | 400 Bad Request |
| 8 | Conflict detection (stale updatedAt) | 409 Conflict |
| 9 | Acquire lock na unlocked document | 200 OK, lock set |
| 10 | Acquire lock na locked document (by other) | 409 Conflict |
| 11 | Acquire lock na expired lock | 200 OK, lock acquired |
| 12 | Refresh lock | 200 OK, lockedUntil extended |
| 13 | Release lock | 204 No Content |

### Frontend E2E Tests (Playwright)

| # | Scenariusz | Oczekiwany rezultat |
|---|------------|---------------------|
| 1 | Navigate to edit page | Form loaded with document data |
| 2 | Edit title, wait 2s | Auto-saved, "Saved ✓" shown |
| 3 | Ctrl+S | Immediate save |
| 4 | Escape with unsaved changes | Confirmation dialog |
| 5 | Open same document in 2 tabs | Second tab shows "Locked by..." |
| 6 | Close tab, wait 2min, open in another tab | Lock released, can edit |

---

## 14. Out of Scope (Future)

- Rich text editor (markdown preview, formatting toolbar)
- Real-time collaborative editing (like Google Docs)
- Version history / undo
- Force-release lock by workspace owner
- Mobile-optimized editor
- Offline support with sync

---

## Review History

### 2025-12-28 - Pre-Implementation Review

- Reviewed by: Claude (architecture, security, documentation, test, ux)
- Status: Revised based on review findings
- Changes:
  - Modal → Dedicated edit page
  - Added auto-save mechanism
  - Added edit lock mechanism
  - Added accessibility requirements
  - Added error scenarios
  - Added keyboard interactions
  - Expanded test cases
