# SPEC-017: Registration with Email Verification

**Data:** 2025-12-25
**Status:** Draft
**Priorytet:** P0 (Foundation)
**Rozszerza:** SPEC-011-frontend-auth.md
**Zależności:** Mailpit (dev), nodemailer, Backend Auth API

---

## 1. Cel biznesowy

Implementacja pełnego flow rejestracji z email verification i automatycznym utworzeniem workspace.

### Wartość MVP

- User może się zarejestrować z własnym workspace
- Email verification przed pełnym dostępem
- Bezpieczna aktywacja konta przez link
- Workspace gotowy do użycia po weryfikacji

### Decyzje architektoniczne

| Pytanie | Decyzja |
|---------|---------|
| Token storage | localStorage (refresh) + memory (access) |
| Workspace creation | Automatycznie podczas rejestracji, min 1 wymagany |
| Email provider | nodemailer (Mailpit dev, SMTP prod) |
| RBAC | workspace:create, document:*, user:invite permissions |

---

## 2. User Flow

### 2.1 Registration Flow (3 ekrany)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  /register      │ --> │  /verify-email  │ --> │  /login         │
│                 │     │  (check inbox)  │     │  (success!)     │
│  Email          │     │                 │     │                 │
│  Password       │     │  "Check your    │     │  Redirect to    │
│  Workspace name │     │   email"        │     │  dashboard      │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 2.2 Szczegółowy flow

1. **User wypełnia formularz** (`/register`)
   - Email (unique)
   - Password (min 12 chars, strength indicator)
   - Workspace name

2. **Backend przetwarza rejestrację**
   - Tworzy User (isEmailVerified: false)
   - Tworzy Workspace z nazwą
   - Dodaje User jako owner workspace
   - Generuje emailVerificationToken (crypto.randomBytes(32))
   - Wysyła email przez nodemailer

3. **User widzi "Check your email"** (`/verify-email`)
   - Instrukcja sprawdzenia inbox
   - Przycisk "Resend email" (cooldown 60s)
   - Link do Mailpit (tylko dev)

4. **User klika link w emailu**
   - `GET /verify-email?token=xyz`
   - Frontend wywołuje `POST /auth/verify-email`
   - Backend: isEmailVerified = true

5. **Sukces → redirect do login**
   - User loguje się normalnie
   - Dashboard pokazuje jego workspace

---

## 3. Backend API

### 3.1 Nowe endpointy

#### POST /auth/register

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "workspaceName": "My Knowledge Base"
}
```

**Response (201):**
```json
{
  "message": "Registration successful. Please check your email.",
  "userId": "uuid"
}
```

**Errors:**
- 409: Email already registered
- 400: Validation errors (weak password, invalid email)

#### POST /auth/verify-email

**Request:**
```json
{
  "token": "abc123..."
}
```

**Response (200):**
```json
{
  "message": "Email verified successfully"
}
```

**Errors:**
- 400: Invalid or expired token
- 404: Token not found

#### POST /auth/resend-verification

**Headers:** Authorization: Bearer (zalogowany user)

**Response (200):**
```json
{
  "message": "Verification email sent"
}
```

**Errors:**
- 429: Too many requests (cooldown 60s)
- 400: Email already verified

### 3.2 Schema Prisma

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String?

  // Email verification
  isEmailVerified         Boolean   @default(false)
  emailVerificationToken  String?   @unique
  emailVerificationSentAt DateTime? @db.Timestamptz
  emailVerifiedAt         DateTime? @db.Timestamptz

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt @db.Timestamptz

  // Relations
  workspaces        WorkspaceMember[]
  createdWorkspaces Workspace[]       @relation("CreatedBy")

  @@index([emailVerificationToken])
}

model WorkspaceMember {
  id          String   @id @default(uuid())
  userId      String
  workspaceId String
  role        String   @default("owner")  // owner, admin, member
  permissions String[] // workspace:create, document:create, document:read, user:invite

  user      User      @relation(fields: [userId], references: [id])
  workspace Workspace @relation(fields: [workspaceId], references: [id])

  createdAt DateTime @default(now()) @db.Timestamptz

  @@unique([userId, workspaceId])
}
```

### 3.3 RBAC Permissions

| Permission | Description |
|------------|-------------|
| `workspace:create` | Tworzenie nowych workspaces |
| `document:create` | Dodawanie dokumentów |
| `document:read` | Czytanie dokumentów |
| `document:update` | Edycja dokumentów |
| `document:delete` | Usuwanie dokumentów |
| `user:invite` | Zapraszanie userów do workspace |
| `user:remove` | Usuwanie userów z workspace |

**Default permissions dla owner:** wszystkie

---

## 4. Frontend

### 4.1 Struktura plików

```
apps/web/src/features/auth/
├── Register.tsx              # Formularz rejestracji
├── VerifyEmail.tsx           # "Check your email" screen
├── VerifyEmailCallback.tsx   # Obsługa linku z emaila
├── api/
│   └── authApi.ts            # + register, verifyEmail, resendVerification
└── model/
    └── authStore.ts          # bez zmian
```

### 4.2 Register Form

```typescript
// Walidacja Zod
const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string()
    .min(12, 'At least 12 characters')
    .regex(/[A-Z]/, 'At least one uppercase')
    .regex(/[a-z]/, 'At least one lowercase')
    .regex(/[0-9]/, 'At least one number')
    .regex(/[^A-Za-z0-9]/, 'At least one special character'),
  workspaceName: z.string().min(2, 'At least 2 characters'),
});
```

### 4.3 Password Strength Indicator

- 0-25%: Weak (red)
- 26-50%: Fair (orange)
- 51-75%: Good (yellow)
- 76-100%: Strong (green)

Kryteria:
- Length (12+ chars)
- Uppercase
- Lowercase
- Numbers
- Special characters

### 4.4 Routes

```typescript
// App.tsx
<Route path="/register" element={<Register />} />
<Route path="/verify-email" element={<VerifyEmail />} />
<Route path="/auth/verify" element={<VerifyEmailCallback />} />
```

---

## 5. Email

### 5.1 Konfiguracja Mailpit (dev)

```yaml
# docker-compose.yml (już skonfigurowane)
mailpit:
  image: axllent/mailpit
  ports:
    - "1025:1025"  # SMTP
    - "8025:8025"  # Web UI
```

### 5.2 Environment variables

```bash
# .env
SMTP_HOST=mailpit        # localhost dla local dev
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=help@synjar.com
SMTP_FROM_NAME=Synjar

EMAIL_VERIFICATION_TOKEN_TTL=24h
EMAIL_VERIFICATION_URL=http://localhost:5173/auth/verify
```

### 5.3 Email Template

**Subject:** Verify your email - Synjar

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; background: #1e293b; color: #e2e8f0; padding: 40px; }
    .container { max-width: 600px; margin: 0 auto; }
    .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px;
           text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { margin-top: 40px; color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome to Synjar!</h1>
    <p>Click the button below to verify your email address:</p>
    <p><a href="{{verificationUrl}}" class="btn">Verify Email Address</a></p>
    <p class="footer">
      Or copy this link: {{verificationUrl}}<br>
      This link expires in 24 hours.
    </p>
  </div>
</body>
</html>
```

---

## 6. NestJS Implementation

### 6.1 Struktura plików

```
apps/api/src/
├── application/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts         # + register, verifyEmail
│   │   ├── auth.controller.ts      # + endpoints
│   │   └── dto/
│   │       ├── register.dto.ts
│   │       └── verify-email.dto.ts
│   └── email/
│       ├── email.module.ts
│       ├── email.service.ts
│       └── templates/
│           └── email-verification.hbs
├── domain/
│   └── user/
│       └── email-verification-token.vo.ts
└── infrastructure/
    └── prisma/
        └── migrations/
            └── XXXXXX_add_email_verification/
```

### 6.2 Dependencies

```bash
pnpm add @nestjs-modules/mailer nodemailer handlebars
pnpm add -D @types/nodemailer
```

---

## 7. Security

### 7.1 Token Generation

```typescript
import { randomBytes } from 'crypto';

function generateVerificationToken(): string {
  return randomBytes(32).toString('hex'); // 64 chars
}
```

### 7.2 Zabezpieczenia

| Aspekt | Implementacja |
|--------|---------------|
| Token TTL | 24 godziny |
| Resend cooldown | 60 sekund |
| Password hashing | bcrypt (10 rounds) |
| Rate limiting | 5 req/min na register |
| Email enumeration | Generic error "Check your email" |

---

## 8. Testy

### 8.1 Unit Tests

```typescript
describe('RegisterUseCase', () => {
  it('should create user with unverified email', async () => {});
  it('should create workspace for user', async () => {});
  it('should send verification email', async () => {});
  it('should reject weak password', async () => {});
  it('should reject duplicate email', async () => {});
});

describe('VerifyEmailUseCase', () => {
  it('should verify email with valid token', async () => {});
  it('should reject expired token', async () => {});
  it('should reject invalid token', async () => {});
});
```

### 8.2 E2E Tests

```typescript
describe('Registration Flow (E2E)', () => {
  it('should complete full registration flow', async () => {
    // 1. POST /auth/register
    // 2. Check email was sent (mock)
    // 3. POST /auth/verify-email
    // 4. POST /auth/login
    // 5. GET /workspaces → has 1 workspace
  });
});
```

---

## 9. Definition of Done

### Backend
- [ ] Migracja Prisma (email verification fields)
- [ ] EmailModule z nodemailer
- [ ] POST /auth/register
- [ ] POST /auth/verify-email
- [ ] POST /auth/resend-verification
- [ ] Email template (Handlebars)
- [ ] Unit tests dla use cases
- [ ] E2E test registration flow

### Frontend
- [ ] Register.tsx z password strength
- [ ] VerifyEmail.tsx ("Check your email")
- [ ] VerifyEmailCallback.tsx
- [ ] authApi.ts (register, verifyEmail, resend)
- [ ] Routes configuration
- [ ] Unit tests dla forms
- [ ] ARIA labels i accessibility

### DevOps
- [ ] Mailpit w docker-compose (już jest)
- [ ] Env variables documentation
- [ ] README.md update

---

## 10. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| Backend: Email Module | M |
| Backend: Register endpoint | M |
| Backend: Verify endpoint | S |
| Frontend: Register form | M |
| Frontend: Verify screens | S |
| Tests | M |
| **TOTAL** | **L** |

---

## 11. Następne kroki

1. Migracja Prisma
2. Email Module (NestJS)
3. Register endpoint
4. Frontend Register form
5. Verify email flow
6. Tests
7. Integration test całego flow

---

## Review History

### 2025-12-25 - Pre-Implementation Review
- Reviewed by: Claude (architecture, security, documentation, test, ux)
- Status: ⚠️ Created based on review findings from SPEC-011
- Findings: SPEC-011 brakowało email verification, workspace creation, backend API
- This spec addresses all CRITICAL gaps identified in review
