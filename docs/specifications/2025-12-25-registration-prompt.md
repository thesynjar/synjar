# Prompt do kontynuacji implementacji Registration

## Kontekst

Zaimplementowano frontend auth (login, protected routes, JWT storage). Teraz trzeba dodać registration z email verification.

## Co jest gotowe

### Frontend (`community/apps/web/`)
- ✅ Auth system (Zustand store, API client, AuthProvider)
- ✅ Login page
- ✅ Protected routes
- ✅ Layout z logout
- ✅ Dashboard (basic)

### Infrastruktura
- ✅ Mailpit w docker-compose (port 1025 SMTP, 8025 UI)
- ✅ React 19, Vite 6, Tailwind 4, React Router 7

## Co trzeba zrobić

Implementacja wg specyfikacji: `docs/specifications/2025-12-25-registration-with-email-verification.md`

### Kolejność implementacji (TDD):

1. **Backend - Prisma migration**
   - Dodaj do User: isEmailVerified, emailVerificationToken, emailVerificationSentAt, emailVerifiedAt
   - Dodaj model WorkspaceMember z permissions
   - `pnpm prisma migrate dev --name add_email_verification`

2. **Backend - Email Module**
   - `@nestjs-modules/mailer` + nodemailer
   - Email service z template Handlebars
   - Plik: `apps/api/src/application/email/`

3. **Backend - Register endpoint**
   - POST /auth/register
   - Tworzy User + Workspace + wysyła email
   - Plik: `apps/api/src/application/auth/`

4. **Backend - Verify endpoint**
   - POST /auth/verify-email
   - POST /auth/resend-verification

5. **Frontend - Register form**
   - `apps/web/src/features/auth/Register.tsx`
   - Password strength indicator
   - Workspace name field

6. **Frontend - Verify screens**
   - `apps/web/src/features/auth/VerifyEmail.tsx`
   - `apps/web/src/features/auth/VerifyEmailCallback.tsx`

7. **Testy**
   - Unit tests dla use cases
   - E2E test całego flow

## Ważne pliki do przeczytania

```
community/
├── CLAUDE.md                    # Zasady projektu (TDD, DDD, Clean Architecture)
├── TODO.md                      # Lista zadań
├── docs/specifications/
│   ├── 2025-12-25-registration-with-email-verification.md  # GŁÓWNA SPEC
│   └── SPEC-011-frontend-auth.md                           # Kontekst auth
├── apps/api/
│   └── src/application/auth/    # Istniejący auth (rozszerzyć)
└── apps/web/
    └── src/features/auth/       # Istniejący frontend auth (rozszerzyć)
```

## Decyzje architektoniczne

| Pytanie | Decyzja |
|---------|---------|
| Token storage | localStorage (refresh) + memory (access) |
| Workspace | Min 1 wymagany, tworzony podczas rejestracji |
| Email | nodemailer (Mailpit dev, SMTP prod) |
| Password | Min 12 chars, uppercase, lowercase, number, special |
| Token TTL | 24h |
| Resend cooldown | 60s |
| RBAC | workspace:create, document:*, user:invite |

## Env variables potrzebne

```bash
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_FROM_EMAIL=help@synjar.com
EMAIL_VERIFICATION_TOKEN_TTL=24h
EMAIL_VERIFICATION_URL=http://localhost:5173/auth/verify
```

---

## Prompt do wklejenia

```
Kontynuuj implementację registration z email verification dla Synjar.

Przeczytaj:
1. community/CLAUDE.md - zasady projektu
2. community/docs/specifications/2025-12-25-registration-with-email-verification.md - specyfikacja
3. community/apps/api/src/application/auth/ - istniejący backend auth
4. community/apps/web/src/features/auth/ - istniejący frontend auth

Zacznij od:
1. Migracji Prisma (email verification fields + WorkspaceMember)
2. Email Module w NestJS

Używaj TDD - najpierw testy, potem implementacja.
Używaj agentów do poszczególnych zadań (max 5 równolegle).
Zapisuj postępy w specyfikacji.
```
