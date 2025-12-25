# UX Design: Registration Flow for Synjar Community

**Date:** 2025-12-25
**Status:** Design Proposal
**Type:** UX Specification
**Product:** Synjar Community (self-hosted RAG knowledge base)

---

## Executive Summary

Flow rejestracji dla Synjar wymaga weryfikacji email przez aktywację (help@synjar.com w development, Mailpit). Projektujemy prosty, intuicyjny proces 3-ekranowy z dobrym UX na mobile i desktop.

**Kluczowe decyzje UX:**
1. Email verification PRZED pełnym dostępem (security first)
2. Workspace tworzymy PODCZAS rejestracji (immediate value)
3. Single-screen flow dla mobile (progressive disclosure)
4. Clear error states i komunikaty pomocnicze

---

## 1. Kontekst produktu

### 1.1 Czym jest Synjar?

Synjar to self-hosted RAG (Retrieval-Augmented Generation) backend - knowledge base z semantic search dla AI. Użytkownik:
- Uploaduje dokumenty (PDF, DOCX, MD, TXT)
- Synjar dzieli je na chunki i tworzy embeddings
- Aplikacje AI pytają Synjar o kontekst (semantic search)

### 1.2 Bounded Context: Registration

W DDD architekturze Synjar, Registration to osobny bounded context:

```
Registration Context
├── User Registration (email + password)
├── Email Verification
└── Initial Workspace Setup

Access Control Context
├── Login
├── Session Management
└── JWT Refresh

Workspace Context
├── Workspace Management
├── Document Upload
└── Semantic Search
```

**Kluczowe zależności:**
- Registration → musi utworzyć User
- Registration → musi utworzyć default Workspace
- Registration → musi wysłać email weryfikacyjny
- User może zalogować się DOPIERO po weryfikacji email

---

## 2. Persony użytkowników

### Persona 1: Tech Founder (Primary)

**Nazwa:** Alex, 32, CTO startup AI

**Cel:** Chce self-hosted RAG dla produktu SaaS, nie chce vendor lock-in (Pinecone $500/mo)

**Pain points:**
- Nie ma czasu na kompleksowy onboarding
- Musi szybko przetestować czy działa
- Needs to start small, scale later

**Oczekiwania od rejestracji:**
- Mniej niż 2 minuty do pierwszego documentu
- Jasne instrukcje co dalej
- Pewność że dane są bezpieczne (self-hosted)

**Quote:** "I just want to spin it up in Docker and see if it works. No fluff."

---

### Persona 2: Solo Developer (Secondary)

**Nazwa:** Maria, 27, freelance AI developer

**Cel:** Buduje RAG dla klienta, porównuje Synjar z Dify i Quivr

**Pain points:**
- Musi pokazać klientowi demo za tydzień
- Nie zna dobrze backend (frontend dev)
- Potrzebuje dokumentacji

**Oczekiwania od rejestracji:**
- Friendly UI, nie wymaga terminal
- Podpowiedzi co robić dalej
- Link do docs jeśli coś nie działa

**Quote:** "If I can't figure it out in 10 minutes, I'll just use Pinecone API."

---

## 3. Customer Journey: Registration

### 3.1 High-level flow

```
Landing Page → Register → Email Sent → Mailpit → Click Link → Verified → Login → Dashboard → Upload Doc
     ↓            ↓           ↓            ↓          ↓          ↓        ↓         ↓           ↓
  "Try it"   Fill form   Check email   See email  Activate  Success  Enter  See workspace Upload first
                                                                              empty state   document
```

**Czas do value:** 3-5 minut (zakładając development z Mailpit)

---

### 3.2 Detailed steps

| Krok | Ekran | Co użytkownik widzi | Co robi | Backend call | Czas |
|------|-------|---------------------|---------|--------------|------|
| 1 | Landing page | "Get Started" CTA | Klika przycisk | - | 5s |
| 2 | Register form | Email, password, workspace name | Wypełnia dane | - | 30s |
| 3 | Register form | Submit | Klika "Create account" | POST /auth/register | 1s |
| 4 | Email sent screen | "Check your email at..." | Otwiera Mailpit | - | 10s |
| 5 | Mailpit | Widzi email od help@synjar.com | Klika "Verify Email" | - | 5s |
| 6 | Email verified screen | "Email verified! You can now login" | Klika "Go to Login" | GET /auth/verify?token=... | 1s |
| 7 | Login page | Email pre-filled | Wpisuje hasło | POST /auth/login | 1s |
| 8 | Dashboard | Workspace ready + empty state | Klika "Upload document" | GET /workspaces | 1s |

**Total:** ~54 seconds (bez czytania instrukcji)

---

## 4. Ekrany (Wireframes + Copy)

### Ekran 1: Register Form

**URL:** `/register`
**Access:** Public

#### Desktop Layout (1280px+)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         [Synjar Logo]                           │
│                                                                 │
│               Create your self-hosted knowledge base            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  Email address                                          │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ you@example.com                                  │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │  We'll send a verification link to this address          │    │
│  │                                                         │    │
│  │  Password                                               │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ ••••••••••••                                     │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │  At least 12 characters, mix of letters, numbers, symbols │  │
│  │                                                         │    │
│  │  Your first workspace name                              │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ My AI Project                                    │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │  You can create more workspaces later                   │    │
│  │                                                         │    │
│  │  ┌────────────────────────────────────────────────┐     │    │
│  │  │          Create account                        │     │    │
│  │  └────────────────────────────────────────────────┘     │    │
│  │                                                         │    │
│  │  Already have an account? Log in                        │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│            Secure • Self-hosted • Zero vendor lock-in           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout (375px)

```
┌────────────────────────┐
│                        │
│     [Synjar Logo]      │
│                        │
│   Create your          │
│   knowledge base       │
│                        │
│  Email address         │
│  ┌──────────────────┐  │
│  │ you@example.com  │  │
│  └──────────────────┘  │
│                        │
│  Password              │
│  ┌──────────────────┐  │
│  │ ••••••••••••     │  │
│  └──────────────────┘  │
│  12+ chars required    │
│                        │
│  Workspace name        │
│  ┌──────────────────┐  │
│  │ My AI Project    │  │
│  └──────────────────┘  │
│                        │
│  ┌──────────────────┐  │
│  │  Create account  │  │
│  └──────────────────┘  │
│                        │
│  Already have an       │
│  account? Log in       │
│                        │
└────────────────────────┘
```

#### Copywriting

**Headline:**
- Desktop: "Create your self-hosted knowledge base"
- Mobile: "Create your knowledge base"

**Field Labels:**
- Email: "Email address" (not "Your email" - clearer for screen readers)
- Password: "Password" (not "Choose password" - shorter)
- Workspace: "Your first workspace name" (explains purpose)

**Helper Text:**
- Email: "We'll send a verification link to this address"
- Password: "At least 12 characters, mix of letters, numbers, symbols"
- Workspace: "You can create more workspaces later" (reduces anxiety)

**CTA Button:**
- "Create account" (not "Sign up" - clearer what happens)

**Footer:**
- "Secure • Self-hosted • Zero vendor lock-in" (key value props)

#### Validation (Client-side)

| Field | Rule | Error message | When shown |
|-------|------|---------------|------------|
| Email | Valid email format | "Please enter a valid email address" | On blur |
| Email | Not already registered | "This email is already registered. Log in instead?" | On submit (API) |
| Password | Min 12 chars | "Password must be at least 12 characters" | On blur |
| Password | Contains uppercase | "Password must include at least one uppercase letter" | On blur |
| Password | Contains number | "Password must include at least one number" | On blur |
| Password | Contains special char | "Password must include a special character (@$!%*?&)" | On blur |
| Workspace | Min 1 char | "Workspace name is required" | On submit |
| Workspace | Max 100 chars | "Workspace name is too long (max 100 characters)" | On blur |

**Live validation:**
- Email: validate on blur
- Password: show strength indicator (weak/medium/strong) on typing
- Workspace: no live validation (accept any non-empty string)

#### Password Strength Indicator

```
Password               [Show password checkbox]
┌──────────────────────────────────────────┐
│ ••••••••••••                             │
└──────────────────────────────────────────┘
[====      ] Medium strength

Requirements:
✓ At least 12 characters
✓ Uppercase letter
✗ Number
✗ Special character
```

**Colors:**
- Weak: red bar (0-25%)
- Medium: yellow bar (26-75%)
- Strong: green bar (76-100%)

---

### Ekran 2: Email Sent

**URL:** `/register/verify-email`
**Access:** Public (ale użytkownik trafia tu tylko po submit)

#### Desktop Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         [Synjar Logo]                           │
│                                                                 │
│                     [Email Icon (SVG)]                          │
│                                                                 │
│                    Check your email                             │
│                                                                 │
│     We sent a verification link to:                             │
│               alex@example.com                                  │
│                                                                 │
│  Click the link in the email to verify your account.            │
│  The link expires in 24 hours.                                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  📬  Check Mailpit (Development)                    │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                 │
│  Didn't receive the email?                                      │
│  • Check your spam folder                                       │
│  • Resend verification email                                    │
│                                                                 │
│  Wrong email? Go back                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout

```
┌────────────────────────┐
│                        │
│     [Synjar Logo]      │
│                        │
│    [Email Icon]        │
│                        │
│   Check your email     │
│                        │
│ We sent a link to:     │
│  alex@example.com      │
│                        │
│ Click the link to      │
│ verify your account.   │
│ Expires in 24 hours.   │
│                        │
│ ┌──────────────────┐   │
│ │ 📬 Check Mailpit │   │
│ └──────────────────┘   │
│                        │
│ Didn't receive it?     │
│ • Check spam           │
│ • Resend email         │
│                        │
│ Wrong email? Go back   │
│                        │
└────────────────────────┘
```

#### Copywriting

**Headline:** "Check your email"

**Body:**
```
We sent a verification link to:
alex@example.com

Click the link in the email to verify your account.
The link expires in 24 hours.
```

**Development CTA:**
```
📬 Check Mailpit (Development)
[Button links to http://localhost:8025]
```

**Production variant:** (button nie wyświetla się)

**Troubleshooting:**
```
Didn't receive the email?
• Check your spam folder
• Resend verification email [link triggers API call]

Wrong email? Go back [link to /register]
```

#### Behavior

**On load:**
- Email address passed via URL param or state: `?email=alex@example.com`
- If email missing, redirect to /register

**"Resend" link:**
- POST /auth/resend-verification
- Show success toast: "Email sent again. Check your inbox."
- Disable link for 60 seconds (prevent spam)

**"Check Mailpit" button:**
- Only visible if `process.env.NODE_ENV === 'development'`
- Opens http://localhost:8025 in new tab
- Has special styling (development yellow badge)

---

### Ekran 3: Email Verified

**URL:** `/auth/verify?token=abc123...`
**Access:** Public (single-use link from email)

#### Desktop Layout (Success)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         [Synjar Logo]                           │
│                                                                 │
│                   [Checkmark Icon (green)]                      │
│                                                                 │
│                  Email verified!                                │
│                                                                 │
│     Your account is ready. You can now log in and               │
│     start uploading documents to your workspace.                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │             Go to Login                             │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                 │
│  Your workspace "My AI Project" is waiting for you.             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Desktop Layout (Error - Invalid/Expired Token)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         [Synjar Logo]                           │
│                                                                 │
│                     [X Icon (red)]                              │
│                                                                 │
│              Verification link expired                          │
│                                                                 │
│     This link is no longer valid. It may have expired           │
│     or already been used.                                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │          Request new verification link              │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                 │
│  Or go back to Log in                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout (Success)

```
┌────────────────────────┐
│                        │
│     [Synjar Logo]      │
│                        │
│    [✓ Icon green]      │
│                        │
│   Email verified!      │
│                        │
│ Your account is ready. │
│ Log in to start.       │
│                        │
│ ┌──────────────────┐   │
│ │  Go to Login     │   │
│ └──────────────────┘   │
│                        │
│ Workspace ready:       │
│ "My AI Project"        │
│                        │
└────────────────────────┘
```

#### Copywriting

**Success:**
- Headline: "Email verified!"
- Body: "Your account is ready. You can now log in and start uploading documents to your workspace."
- CTA: "Go to Login"
- Footer: "Your workspace "My AI Project" is waiting for you."

**Error (expired/invalid token):**
- Headline: "Verification link expired"
- Body: "This link is no longer valid. It may have expired or already been used."
- CTA: "Request new verification link"
- Footer: "Or go back to Log in"

#### Behavior

**On load:**
- Extract token from URL: `/auth/verify?token=abc123`
- Call GET /auth/verify?token=abc123
- Show loading spinner during API call
- If success:
  - Show success screen
  - Auto-redirect to /login after 3 seconds (with countdown "Redirecting in 3...")
  - User can click "Go to Login" immediately
- If error:
  - Show error screen
  - "Request new link" → redirect to /register with email pre-filled if available

---

## 5. Email Template

### 5.1 Email: Verify Your Email Address

**From:** Synjar <help@synjar.com>
**Subject:** Verify your email for Synjar

**Plain text version:**

```
Hi there,

Welcome to Synjar! You're almost ready to start building your knowledge base.

Please verify your email address by clicking the link below:

https://localhost:3000/auth/verify?token=abc123xyz456...

This link expires in 24 hours.

If you didn't create a Synjar account, you can safely ignore this email.

---
Synjar - Self-hosted RAG knowledge base
https://synjar.com
```

**HTML version:**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email for Synjar</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      padding: 40px 0 20px;
    }
    .logo {
      font-size: 32px;
      font-weight: 700;
      color: #0ea5e9;
    }
    .content {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 40px;
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      background: #0ea5e9;
      color: #ffffff !important;
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      color: #64748b;
      font-size: 14px;
      padding: 20px 0;
    }
    .expiry {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px 16px;
      margin: 20px 0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Synjar</div>
  </div>

  <div class="content">
    <h1>Verify your email address</h1>

    <p>Hi there,</p>

    <p>Welcome to Synjar! You're almost ready to start building your self-hosted knowledge base.</p>

    <p>Please verify your email address by clicking the button below:</p>

    <center>
      <a href="https://localhost:3000/auth/verify?token={{token}}" class="button">
        Verify Email Address
      </a>
    </center>

    <div class="expiry">
      ⏱️ This link expires in 24 hours
    </div>

    <p style="font-size: 14px; color: #64748b;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="https://localhost:3000/auth/verify?token={{token}}">https://localhost:3000/auth/verify?token={{token}}</a>
    </p>

    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

    <p style="font-size: 14px; color: #64748b;">
      If you didn't create a Synjar account, you can safely ignore this email.
    </p>
  </div>

  <div class="footer">
    <p>
      <strong>Synjar</strong> - Self-hosted RAG knowledge base<br>
      <a href="https://synjar.com" style="color: #0ea5e9;">synjar.com</a>
    </p>
  </div>
</body>
</html>
```

### 5.2 Email variables

**Template variables (Handlebars):**
- `{{token}}` - verification token (long alphanumeric string)
- `{{email}}` - user email (for personalization if needed)
- `{{workspaceName}}` - workspace name (optional, for future personalization)

**Email delivery (development):**
- Send via Mailpit SMTP (localhost:1025)
- Emails visible at http://localhost:8025

**Email delivery (production):**
- SendGrid, Postmark, or AWS SES
- Configure via env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

---

## 6. Error States & Edge Cases

### 6.1 Error States

| Scenario | Where | What happens | User sees |
|----------|-------|--------------|-----------|
| **Email already registered** | Register form | API returns 409 Conflict | Alert: "This email is already registered. Log in instead?" [link to login] |
| **Weak password** | Register form | Client-side validation fails | Inline error: "Password must include..." + strength indicator red |
| **Network error** | Register form | fetch() fails | Alert: "Connection error. Please try again." + [Retry] button |
| **Verification token expired** | Verify page | GET /auth/verify returns 410 | Error screen: "Link expired. Request new one?" |
| **Verification token invalid** | Verify page | GET /auth/verify returns 400 | Error screen: "Invalid link. Go back to register." |
| **Already verified** | Verify page | GET /auth/verify returns 200 but user already verified | Success screen but note: "Email already verified. You can log in." |
| **Email send fails** | Register submit | API returns 500 | Alert: "Account created but email failed to send. Contact support: help@synjar.com" |
| **Mailpit not running** | Register submit (dev) | Email fails silently | Show warning banner: "⚠️ Development: Mailpit not running? Start with docker compose up mailpit" |

### 6.2 Edge Cases

**Case 1: User clicks "Resend" multiple times**
- Solution: Disable button for 60s after click
- Show countdown: "Resend (available in 45s)"
- Backend: rate limit to 3 emails per hour per email address

**Case 2: User registers, doesn't verify, tries to register again**
- Solution: API checks if user exists but not verified
- Response: "Email already registered but not verified. Check your email or request new link."
- CTA: [Request new verification link]

**Case 3: User registers, verifies, but forgets and tries to verify again**
- Solution: GET /auth/verify returns success but notes already verified
- Screen: "Email already verified! You can log in now." [Go to Login]

**Case 4: User opens verification link on different device**
- Solution: Works fine (token is in URL, no session required)
- After verify, redirect to login with note: "Verified! Log in on this device."

**Case 5: User closes browser before email sent confirmation**
- Solution: Email sent screen is public route, can access via /register/verify-email?email=...
- User can manually navigate back if needed

**Case 6: Workspace name contains special characters**
- Solution: Accept any characters (sanitize on backend)
- Frontend: no validation, just max length

**Case 7: Email in different language (e.g. UTF-8 emoji)**
- Solution: HTML email supports UTF-8
- Test with: test@example.com, test+tag@example.com, tëst@example.com

**Case 8: User types email with leading/trailing spaces**
- Solution: Trim on blur: `email.trim()`
- Prevent frustrating "email not found" errors

---

## 7. Accessibility (WCAG 2.1 Level AA)

### 7.1 Keyboard Navigation

**All screens:**
- Tab order: Logo (skip) → Email input → Password input → Workspace input → Create account button → Links
- Enter key submits form from any input
- Escape key clears focus (doesn't close anything)

**Focus indicators:**
- All interactive elements have visible focus ring
- Color: blue ring (2px solid #0ea5e9)
- Offset: 2px outside element
- Applies to: inputs, buttons, links

### 7.2 Screen Reader Support

**Register form:**
```html
<form aria-labelledby="register-heading">
  <h1 id="register-heading">Create your self-hosted knowledge base</h1>

  <div>
    <label for="email">Email address</label>
    <input
      id="email"
      type="email"
      aria-describedby="email-help email-error"
      aria-invalid="false"
    />
    <p id="email-help">We'll send a verification link to this address</p>
    <p id="email-error" role="alert" aria-live="polite"></p>
  </div>

  <div>
    <label for="password">Password</label>
    <input
      id="password"
      type="password"
      aria-describedby="password-help password-requirements"
      aria-invalid="false"
    />
    <p id="password-help">At least 12 characters, mix of letters, numbers, symbols</p>
    <ul id="password-requirements" aria-live="polite">
      <li aria-label="12 characters requirement met">✓ At least 12 characters</li>
      <li aria-label="Uppercase requirement not met">✗ Uppercase letter</li>
    </ul>
  </div>

  <button type="submit" aria-busy="false">
    Create account
  </button>
</form>
```

**Key attributes:**
- `aria-labelledby` - links heading to form
- `aria-describedby` - links help text to inputs
- `aria-invalid` - marks validation errors
- `aria-live="polite"` - announces errors without interrupting
- `role="alert"` - immediate announcement for critical errors
- `aria-busy="true"` - on submit button during API call

### 7.3 Color Contrast

**Text contrast (WCAG AA: 4.5:1):**
| Element | Foreground | Background | Ratio | Pass |
|---------|-----------|------------|-------|------|
| Body text | #1e293b | #ffffff | 14.8:1 | ✓ |
| Helper text | #64748b | #ffffff | 5.1:1 | ✓ |
| Link | #0ea5e9 | #ffffff | 3.2:1 | ✗ Use #0284c7 (4.6:1) |
| Button text | #ffffff | #0ea5e9 | 3.1:1 | ✗ Use #0369a1 bg (4.7:1) |
| Error text | #dc2626 | #ffffff | 5.9:1 | ✓ |
| Success text | #16a34a | #ffffff | 3.4:1 | ✗ Use #15803d (4.6:1) |

**Fix:**
- Links: Use Tailwind `text-sky-700` instead of `text-sky-500`
- Buttons: Use `bg-sky-700` instead of `bg-sky-500`
- Success: Use `text-green-700` instead of `text-green-600`

### 7.4 Mobile Accessibility

**Touch targets:**
- Minimum 44x44px (WCAG 2.5.5)
- All buttons and links meet this
- Inputs: min-height 48px

**Zoom support:**
- Text scales up to 200% without horizontal scroll
- Viewport meta: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- No `maximum-scale=1.0` (prevents pinch zoom)

---

## 8. Mobile UX Considerations

### 8.1 Mobile-First Design

**Form inputs:**
- Full width on mobile (max-width on desktop)
- Large touch targets (min 48px height)
- Proper input types for mobile keyboards:
  - `type="email"` → shows @ key
  - `type="password"` → shows strong password suggestion
  - `autocomplete="email"` → suggests saved emails
  - `autocomplete="new-password"` → suggests strong password

**Progressive disclosure:**
- Show one field at a time on very small screens (<375px)?
- NO - keep all fields visible. Users need to see context.
- Instead: increase spacing, larger fonts

### 8.2 Mobile-Specific Features

**Autofill:**
```html
<input
  type="email"
  name="email"
  autocomplete="email"
  inputmode="email"
/>

<input
  type="password"
  name="password"
  autocomplete="new-password"
/>
```

**iOS Safari:**
- `inputmode="email"` - optimized email keyboard
- `:focus { font-size: 16px; }` - prevents zoom on focus (iOS Safari auto-zooms if <16px)

**Android Chrome:**
- Shows "Suggest strong password" if `autocomplete="new-password"`
- Auto-fills verified email from Google account

### 8.3 Mobile Performance

**Critical CSS:**
- Inline critical CSS for register form (no flash of unstyled content)
- Total inline CSS < 14KB (fits in first TCP packet)

**Images:**
- SVG icons (inline, no HTTP request)
- No external images on register flow

**JS bundle:**
- Code split: only load registration code on /register
- Target: < 50KB gzipped JS for register page

---

## 9. Performance Metrics

### 9.1 Web Vitals Targets

| Metric | Target | What it measures |
|--------|--------|------------------|
| **LCP** | < 2.5s | Largest Contentful Paint (form visible) |
| **FID** | < 100ms | First Input Delay (can type immediately) |
| **CLS** | < 0.1 | Cumulative Layout Shift (no jumps) |
| **TTFB** | < 600ms | Time to First Byte (server response) |

### 9.2 User-Perceived Performance

**Optimistic UI:**
- Show "Sending..." state immediately on submit
- Don't wait for API response to show feedback
- If API fails, revert and show error

**Loading states:**
- Submit button: "Create account" → "Creating account..." + spinner
- Disable form during submit (prevent double-submit)
- Email sent screen: show immediately after submit (optimistic)

**Error recovery:**
- Keep form data on error (don't clear inputs)
- Focus on first error field
- Scroll to error if below fold

---

## 10. Security Considerations

### 10.1 Client-Side Security

**Password visibility toggle:**
```html
<div class="relative">
  <input
    type={showPassword ? 'text' : 'password'}
    id="password"
  />
  <button
    type="button"
    aria-label={showPassword ? 'Hide password' : 'Show password'}
    onClick={() => setShowPassword(!showPassword)}
  >
    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
  </button>
</div>
```

**No sensitive data in URL:**
- Never pass password in URL
- Token in URL is OK (single-use, expires)
- Email in URL is OK for email sent screen (?email=... not sensitive)

**HTTPS enforcement:**
- Development: warn if not using https (show banner)
- Production: force HTTPS redirect (nginx level)

### 10.2 Email Security

**SPF/DKIM/DMARC:**
- Configure for help@synjar.com domain
- Prevents emails going to spam

**Rate limiting:**
- Max 3 verification emails per hour per email address
- Prevent email bombing

**Token security:**
- Token: 64-character random string (crypto.randomBytes(32).toString('hex'))
- Expires: 24 hours
- Single-use: invalidate after successful verification
- Stored hashed in database (bcrypt)

---

## 11. Implementation Checklist

### Phase 1: Core Flow (MVP)

- [ ] **Backend API:**
  - [ ] POST /auth/register - creates user + workspace + sends email
  - [ ] GET /auth/verify?token=... - verifies email
  - [ ] POST /auth/resend-verification - resends email
  - [ ] Email template (HTML + plain text)
  - [ ] Mailpit integration (development)

- [ ] **Frontend:**
  - [ ] Register form component (React Hook Form + Zod)
  - [ ] Email sent screen
  - [ ] Email verified screen (success + error)
  - [ ] Routing (/register, /register/verify-email, /auth/verify)
  - [ ] Form validation (client-side)
  - [ ] Error handling (network, API errors)

- [ ] **UX:**
  - [ ] Loading states (submit button spinner)
  - [ ] Success states (checkmark icon, success message)
  - [ ] Error states (alert boxes, inline errors)
  - [ ] Accessibility (ARIA labels, focus management)
  - [ ] Mobile responsive (test 375px, 768px, 1280px)

- [ ] **Testing:**
  - [ ] Unit tests (form validation)
  - [ ] Integration tests (register flow)
  - [ ] E2E test (Playwright: register → verify → login)
  - [ ] Accessibility audit (axe, WAVE)

### Phase 2: Polish (Post-MVP)

- [ ] Password strength meter (visual feedback)
- [ ] "Show password" toggle
- [ ] Auto-focus first input on page load
- [ ] Remember email on error (don't clear form)
- [ ] Auto-redirect after verify (3s countdown)
- [ ] Toast notifications (success, error)
- [ ] Analytics tracking (registration funnel)

### Phase 3: Advanced (Future)

- [ ] Social login (Google, GitHub)
- [ ] Magic link login (passwordless)
- [ ] Email confirmation on workspace creation
- [ ] Onboarding checklist after registration
- [ ] Welcome email with getting started guide

---

## 12. Success Metrics

### 12.1 Registration Funnel

| Step | Metric | Target | How to track |
|------|--------|--------|--------------|
| 1. Visit /register | Pageviews | - | Analytics |
| 2. Start typing | Form interaction | >80% | Analytics event |
| 3. Submit form | Form submissions | >60% | POST /auth/register |
| 4. Email sent | API success | >95% | Log success rate |
| 5. Open email | Email opens | >70% | Mailpit (dev) / SendGrid (prod) |
| 6. Click verify link | Link clicks | >90% | GET /auth/verify |
| 7. Complete verification | Verified users | >95% | User.emailVerified = true |
| 8. First login | Logins within 24h | >80% | POST /auth/login timestamp |

**Drop-off analysis:**
- Most critical: Step 2 → 3 (form submit)
- Second: Step 5 → 6 (email open)

### 12.2 UX Quality Metrics

**Time to verify:**
- Target: < 5 minutes from /register to verified
- Track: timestamp(register) - timestamp(verified)

**Error rate:**
- Target: < 5% of registrations encounter errors
- Track: API error responses / total requests

**Mobile completion:**
- Target: Mobile conversion ≥ Desktop conversion
- Track: completed registrations by device type

---

## 13. Figma Mockups (Links)

**TODO:** Create Figma designs for:
1. Register form (desktop + mobile)
2. Email sent screen (desktop + mobile)
3. Email verified screen (success + error)
4. Email template (HTML preview)

**Design system:**
- Use Tailwind CSS default colors (sky for primary)
- Typography: Inter font family
- Icons: Heroicons (MIT license)

---

## 14. API Contract

### POST /auth/register

**Request:**
```json
{
  "email": "alex@example.com",
  "password": "MyP@ssw0rd!2024",
  "workspaceName": "My AI Project"
}
```

**Response (201 Created):**
```json
{
  "message": "Registration successful. Please check your email to verify your account.",
  "user": {
    "id": "usr_abc123",
    "email": "alex@example.com",
    "emailVerified": false
  },
  "workspace": {
    "id": "ws_xyz789",
    "name": "My AI Project"
  }
}
```

**Errors:**
- 400 Bad Request - validation error (weak password, invalid email)
- 409 Conflict - email already registered
- 500 Internal Server Error - email send failed

### GET /auth/verify

**Request:**
```
GET /auth/verify?token=abc123xyz456...
```

**Response (200 OK):**
```json
{
  "message": "Email verified successfully",
  "user": {
    "id": "usr_abc123",
    "email": "alex@example.com",
    "emailVerified": true
  }
}
```

**Errors:**
- 400 Bad Request - invalid token format
- 410 Gone - token expired
- 404 Not Found - token not found (already used or invalid)

### POST /auth/resend-verification

**Request:**
```json
{
  "email": "alex@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "Verification email sent"
}
```

**Errors:**
- 404 Not Found - email not found
- 400 Bad Request - email already verified
- 429 Too Many Requests - rate limit exceeded

---

## 15. Documentation Updates

**After implementation, update:**

1. **docs/specifications/SPEC-017-registration-flow.md** (this file)
2. **apps/web/README.md** - add registration setup instructions
3. **API docs (Swagger)** - document /auth/register, /auth/verify endpoints
4. **User guide** - "Getting Started" page with screenshots

---

## 16. Questions & Decisions

### Open Questions

1. **Should we require workspace name during registration?**
   - ✓ YES - gives immediate value, user has something to work with
   - Alternative: Create default workspace "My Workspace" → user can rename later

2. **Should we allow login before email verification?**
   - ✗ NO - security risk (prevents abuse)
   - User must verify email to access any features

3. **How long should verification token be valid?**
   - ✓ 24 hours - long enough to check email, short enough for security

4. **Should we send welcome email after verification?**
   - Phase 2 - yes, with getting started guide
   - MVP - no, keep it simple

5. **Should we track marketing source (UTM params)?**
   - Phase 3 - yes, for growth analysis
   - MVP - no

### Decisions Made

| Decision | Rationale |
|----------|-----------|
| Email verification required | Security + prevent spam accounts |
| Workspace created during registration | Immediate value, clear next step |
| Single-screen registration form | Simple, low friction (3 fields only) |
| 24h token expiry | Balance convenience + security |
| Mailpit for development | Easy to test emails locally |
| No password confirmation field | Modern UX (show password toggle instead) |
| No CAPTCHA | Self-hosted = low spam risk, can add later if needed |

---

## 17. Conclusion

This registration flow prioritizes:

1. **Speed to value** - User has workspace in <5 minutes
2. **Security** - Email verification prevents abuse
3. **Simplicity** - Only 3 form fields, clear next steps
4. **Accessibility** - WCAG 2.1 AA compliant
5. **Mobile-first** - Works seamlessly on all devices

**Next steps:**
1. Review this spec with team
2. Create Figma mockups
3. Implement backend API (SPEC-017-backend)
4. Implement frontend (SPEC-017-frontend)
5. Write E2E tests
6. User testing with 5 people

**Success criteria:**
- >80% of users complete registration within 5 minutes
- <5% error rate
- Mobile conversion = Desktop conversion
- WCAG 2.1 AA compliance

---

**Appendix A: Competitive Analysis**

| Product | Registration Flow | Email Verification | Time to Value |
|---------|------------------|-------------------|---------------|
| **Synjar (proposed)** | 3 fields, email verify | Required | ~3 min |
| **Dify** | Email, password, org name | Optional | ~2 min |
| **Quivr** | Email, password | Required | ~4 min |
| **Supabase** | Email, password | Required | ~3 min |
| **Clerk** | Email, password | Required | ~2 min |

**Learnings:**
- Most tools require email verification
- 2-4 fields is standard
- Time to value: 2-4 minutes is competitive
- Workspace/org creation during registration is common

---

**Appendix B: Accessibility Testing Plan**

**Manual tests:**
- [ ] Tab through entire form (keyboard only)
- [ ] Use VoiceOver (macOS) / NVDA (Windows)
- [ ] Test with 200% zoom
- [ ] Test with dark mode
- [ ] Test with Windows High Contrast mode

**Automated tests:**
- [ ] axe DevTools browser extension
- [ ] WAVE browser extension
- [ ] Lighthouse accessibility audit (score >90)
- [ ] Pa11y CI in GitHub Actions

**Real users:**
- [ ] Test with 2 screen reader users
- [ ] Test with 2 keyboard-only users
- [ ] Test with 2 low-vision users (zoom, contrast)
