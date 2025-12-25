# Security Review Report - 2025-12-25

## Kontekst

### Przeanalizowane moduły
- React Frontend Application (`apps/web/`)
- Routing i nawigacja (React Router)
- Formularze autentykacji
- Komunikacja z API (proxy, fetch)
- Konfiguracja Vite

### Powiązane dokumenty
- `/Users/michalkukla/development/synjar/enterprise/community/CLAUDE.md` - zasady projektu
- `/Users/michalkukla/development/synjar/enterprise/community/docs/ecosystem.md` - architektura backendu (RLS, multi-tenancy)
- `/Users/michalkukla/development/synjar/enterprise/community/docs/security/CODE_REVIEW_SECURITY_CHECKLIST.md`
- `/Users/michalkukla/development/synjar/enterprise/community/docs/security/SECURITY_GUIDELINES.md`

### Zakres przeglądu
Utworzono nową aplikację React w `apps/web/` z następującymi komponentami:
1. `src/App.tsx` - routing aplikacji
2. `src/main.tsx` - entry point
3. `src/features/home/Home.tsx` - landing page
4. `src/features/auth/Login.tsx` - formularz logowania
5. `src/features/dashboard/Dashboard.tsx` - panel użytkownika
6. `src/shared/Layout.tsx` - layout z nawigacją
7. `vite.config.ts` - konfiguracja dev server i proxy
8. `.env.example` - przykładowe zmienne środowiskowe

---

## 1. CRITICAL (wymaga natychmiastowej naprawy)

### 1.1 [Broken Authentication] Brak przechowywania i weryfikacji JWT tokenu

**Lokalizacja:** `apps/web/src/features/auth/Login.tsx` (linie 17-28)

**Problem:**
```typescript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

if (!response.ok) {
  const data = await response.json();
  throw new Error(data.message || 'Login failed');
}

navigate('/dashboard');
```

Kod nie zapisuje JWT tokenu zwróconego przez backend. Zgodnie z architekturą systemu (ecosystem.md), backend używa JWT-based authentication z JwtAuthGuard, ale frontend nie przechowuje ani nie wykorzystuje tego tokenu.

**Konsekwencje:**
- Użytkownik po zalogowaniu nie jest faktycznie uwierzytelniony
- Wszystkie kolejne requesty do `/api/*` będą nieautoryzowane (401)
- Dashboard.tsx nie załaduje danych workspace'ów
- Brak mechanizmu session management

**Jak naprawić:**

1. Backend powinien zwracać token w response:
```typescript
// Backend (dla referencji)
// POST /api/auth/login
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "...", "email": "..." }
}
```

2. Frontend musi zapisać token i używać go w każdym requeście:
```typescript
// Login.tsx
const data = await response.json();
const token = data.access_token;

// Zapisz token (opcja 1: localStorage - podatne na XSS)
localStorage.setItem('access_token', token);

// Opcja 2: httpOnly cookie (bezpieczniejsze, wymaga zmian w backendzie)
// Backend zwraca: Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Strict
```

3. Stwórz axios/fetch interceptor:
```typescript
// src/lib/api.ts
const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

4. Użyj interceptora w Dashboard i innych protected endpoints.

**Rekomendacja:**
Preferuj **httpOnly cookies** zamiast localStorage (ochrona przed XSS). Wymaga to zmian w backendzie:
- Backend ustawia `Set-Cookie` header
- Frontend automatycznie wysyła cookie (credentials: 'include')
- Token nie jest dostępny dla JavaScript (bezpieczniejsze)

---

### 1.2 [Broken Access Control] Dashboard nie sprawdza autoryzacji

**Lokalizacja:** `apps/web/src/features/dashboard/Dashboard.tsx` (linie 18-30)

**Problem:**
```typescript
const fetchWorkspaces = async () => {
  try {
    const response = await fetch('/api/workspaces');
    if (response.ok) {
      const data = await response.json();
      setWorkspaces(data);
    }
  } catch (err) {
    console.error('Failed to fetch workspaces:', err);
  } finally {
    setIsLoading(false);
  }
};
```

Request do `/api/workspaces` nie zawiera tokenu autoryzacyjnego (patrz 1.1). Ponadto, brak obsługi statusu 401/403:
- Jeśli user nie jest zalogowany → powinien być przekierowany do `/login`
- Brak protected route guard

**Konsekwencje:**
- Użytkownik niezalogowany może wejść na `/dashboard` (choć nie załaduje danych)
- Brak uniform error handling dla unauthorized access
- Naruszenie zasady "Secure by Default"

**Jak naprawić:**

1. Stwórz Protected Route wrapper:
```typescript
// src/shared/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

2. Użyj w App.tsx:
```typescript
<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
  <Route path="/dashboard" element={<Dashboard />} />
</Route>
```

3. Obsłuż 401 w fetch:
```typescript
const response = await fetch('/api/workspaces', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  }
});

if (response.status === 401) {
  localStorage.removeItem('access_token');
  navigate('/login');
  return;
}
```

**Rekomendacja:**
Zaimplementuj **Auth Context** (React Context API) do centralizacji logiki autoryzacji:
```typescript
// src/contexts/AuthContext.tsx
const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify token on mount
    verifyToken();
  }, []);

  const login = async (email, password) => { ... };
  const logout = () => { ... };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
```

---

### 1.3 [Sensitive Data Exposure] Brak HTTPS enforcement

**Lokalizacja:** `apps/web/vite.config.ts` (linie 7-14), ogólna konfiguracja

**Problem:**
Konfiguracja Vite nie wymusza HTTPS:
```typescript
server: {
  port: 3100,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

**Konsekwencje:**
- Credentials (email, password) są przesyłane plain text przez HTTP
- JWT token może być przechwycony (MITM attack)
- Naruszenie OWASP A02:2021 (Cryptographic Failures)

**Jak naprawić:**

1. Development (localhost): opcjonalnie, ale zalecane dla spójności
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    https: true, // Self-signed cert dla dev
    port: 3100,
  }
});
```

2. Production: **OBOWIĄZKOWO** wymuszaj HTTPS
```nginx
# nginx.conf (production)
server {
  listen 80;
  server_name app.synjar.com;

  # Redirect HTTP -> HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name app.synjar.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-XSS-Protection "1; mode=block" always;

  location / {
    root /var/www/app;
    try_files $uri /index.html;
  }
}
```

3. Frontend: sprawdzaj protocol w production
```typescript
// src/utils/security.ts
if (import.meta.env.PROD && window.location.protocol !== 'https:') {
  window.location.href = window.location.href.replace('http:', 'https:');
}
```

**Rekomendacja:**
- Development: używaj HTTPS dla spójności, ale nie blokuj deweloperów
- Production: TYLKO HTTPS (HSTS header z `max-age=31536000`)

---

## 2. HIGH (naprawić przed merge)

### 2.1 [Security Misconfiguration] Brak Content Security Policy (CSP)

**Lokalizacja:** `apps/web/index.html` (brak CSP meta tag)

**Problem:**
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Synjar - Memory for AI</title>
  </head>
  <!-- Brak CSP! -->
```

**Konsekwencje:**
- Brak ochrony przed XSS (inline scripts mogą być wykonane)
- Brak whitelist dla external resources
- OWASP A03:2021 (Injection) - XSS vulnerability

**Jak naprawić:**

1. Dodaj CSP meta tag w `index.html`:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               img-src 'self' data: https:;
               font-src 'self';
               connect-src 'self' /api/*;
               frame-ancestors 'none';
               base-uri 'self';
               form-action 'self';">
```

**Uwaga:** Vite używa inline scripts w dev mode - CSP będzie restrykcyjne tylko w production.

2. Alternatywnie, ustaw CSP header w Nginx (production):
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.synjar.com;" always;
```

**Rekomendacja:**
- Development: luźniejsze CSP (allow inline dla Vite HMR)
- Production: restrykcyjne CSP (brak `unsafe-inline`, `unsafe-eval`)

---

### 2.2 [Broken Authentication] Brak logout functionality

**Lokalizacja:** `apps/web/src/shared/Layout.tsx` (linie 6-13)

**Problem:**
```typescript
const handleLogout = async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/');
  } catch (err) {
    console.error('Logout failed:', err);
  }
};
```

Kod wysyła POST do `/api/auth/logout`, ale:
1. Nie usuwa tokenu z localStorage/cookies
2. Backend prawdopodobnie nie ma endpoint `/api/auth/logout` (JWT są stateless)
3. Nawet po "logout", token jest nadal valid do expiry

**Konsekwencje:**
- Token pozostaje aktywny po logout
- Shared computer vulnerability (ktoś inny może użyć tokenu)
- Session hijacking risk

**Jak naprawić:**

1. Frontend: usuń token lokalnie
```typescript
const handleLogout = () => {
  // Usuń token
  localStorage.removeItem('access_token');

  // Wyczyść stan aplikacji
  // (jeśli używasz Context/Redux)

  // Przekieruj na home
  navigate('/');
};
```

2. Backend (opcjonalnie): token blacklist
```typescript
// Jeśli potrzebna jest natychmiastowa invalidation:
// - Zapisz token ID w Redis blacklist
// - JwtAuthGuard sprawdza czy token.jti NOT IN blacklist
// - Blacklist expiry = token expiry
```

**Rekomendacja:**
- Dla większości przypadków: wystarczy usunąć token po stronie frontendu
- Dla wysokiego bezpieczeństwa: token blacklist w Redis + krótkie expiry (15 min)

---

### 2.3 [Input Validation] Brak client-side validation w formularzu login

**Lokalizacja:** `apps/web/src/features/auth/Login.tsx` (linie 60-83)

**Problem:**
```typescript
<input
  id="email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  placeholder="you@example.com"
  required
/>
```

HTML5 validation (`type="email"`, `required`) jest łatwo omijalne (można wyłączyć w DevTools). Brak:
- Frontend regex validation
- Rate limiting info dla użytkownika
- Sanitization user input

**Konsekwencje:**
- Backend otrzymuje niezwalidowane dane
- UX: brak immediate feedback (user czeka na backend response)
- Potencjalny injection vector (choć backend powinien walidować)

**Jak naprawić:**

1. Dodaj client-side validation:
```typescript
const [errors, setErrors] = useState({ email: '', password: '' });

const validateEmail = (email: string): string | null => {
  if (!email) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Invalid email format';
  }
  if (email.length > 254) return 'Email too long';
  return null;
};

const validatePassword = (password: string): string | null => {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
};

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);

  if (emailError || passwordError) {
    setErrors({ email: emailError || '', password: passwordError || '' });
    return;
  }

  setErrors({ email: '', password: '' });
  // Proceed with login...
};
```

2. Wyświetl błędy:
```typescript
{errors.email && (
  <p className="text-red-400 text-sm mt-1">{errors.email}</p>
)}
```

**Rekomendacja:**
- Client-side validation dla UX
- **Backend ZAWSZE waliduje** (defense in depth)

---

### 2.4 [Logging Failures] Console.error może leakować wrażliwe informacje

**Lokalizacja:** Wiele plików (Dashboard.tsx:26, Layout.tsx:11)

**Problem:**
```typescript
} catch (err) {
  console.error('Failed to fetch workspaces:', err);
}
```

W production, `console.error` może logować:
- Stack traces z internal paths
- Backend error messages (np. "Database connection failed: host 10.0.1.5")
- Potencjalnie PII

**Konsekwencje:**
- Information disclosure (OWASP A09:2021)
- Attacker uzyskuje wiedzę o infrastrukturze
- Brak centralnego error logging (trudno debugować production issues)

**Jak naprawić:**

1. Stwórz error logging service:
```typescript
// src/lib/logger.ts
class Logger {
  error(message: string, error?: any) {
    if (import.meta.env.PROD) {
      // Production: wyślij do Sentry/Datadog
      // Sentry.captureException(error);

      // Nie loguj do console
    } else {
      // Development: console.error OK
      console.error(message, error);
    }
  }

  warn(message: string) { ... }
  info(message: string) { ... }
}

export const logger = new Logger();
```

2. Użyj w kodzie:
```typescript
} catch (err) {
  logger.error('Failed to fetch workspaces', err);
  setError('Unable to load workspaces. Please try again.');
}
```

**Rekomendacja:**
- Development: pełne console logs
- Production: wysyłaj do external service (Sentry, LogRocket)
- User-facing errors: generyczne komunikaty

---

## 3. MEDIUM (naprawić w kolejnej iteracji)

### 3.1 [Security Misconfiguration] Sourcemaps enabled w production

**Lokalizacja:** `apps/web/vite.config.ts` (linia 18)

**Problem:**
```typescript
build: {
  outDir: 'dist',
  sourcemap: true,  // ❌ Włączone w production
}
```

**Konsekwencje:**
- Attacker może odczytać oryginalny source code (TypeScript)
- Łatwiejsze reverse engineering logiki aplikacji
- Potencjalne leakage secret keys (jeśli hardcoded - nie powinno być!)

**Jak naprawić:**

1. Wyłącz sourcemaps w production:
```typescript
build: {
  outDir: 'dist',
  sourcemap: import.meta.env.DEV, // Only in dev
}
```

2. Alternatywnie: tylko dla error tracking
```typescript
sourcemap: 'hidden', // Generates .map files but doesn't link in bundle
```

**Rekomendacja:**
- Development: sourcemap = true (debugowanie)
- Production: sourcemap = false LUB 'hidden' (tylko dla Sentry upload)

---

### 3.2 [Security Misconfiguration] Brak security headers

**Lokalizacja:** Konfiguracja Vite/Nginx (brak)

**Problem:**
Brak następujących security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`

**Konsekwencje:**
- Clickjacking vulnerability (brak X-Frame-Options)
- MIME sniffing attacks
- Brak ochrony przed XSS w legacy browsers

**Jak naprawić:**

1. Development (Vite plugin):
```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'security-headers',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Frame-Options', 'DENY');
          res.setHeader('X-XSS-Protection', '1; mode=block');
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
          next();
        });
      },
    },
  ],
});
```

2. Production (Nginx):
```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

**Rekomendacja:**
Użyj narzędzia online do weryfikacji: https://securityheaders.com/

---

### 3.3 [Broken Access Control] Brak CORS configuration info

**Lokalizacja:** Backend (nie frontend, ale impact na frontend)

**Problem:**
Frontend używa proxy w dev (`/api -> http://localhost:3000`), ale brak informacji o CORS config w production.

**Potencjalne konsekwencje:**
- Frontend production (https://app.synjar.com) nie może komunikować się z API (https://api.synjar.com)
- Jeśli CORS jest zbyt permissive: attacker może wywołać API z własnej domeny

**Jak naprawić:**

1. Backend (NestJS):
```typescript
// main.ts
app.enableCors({
  origin: [
    'https://app.synjar.com',      // Production frontend
    'http://localhost:3100',       // Development frontend
  ],
  credentials: true,               // Jeśli używasz cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

2. Frontend: upewnij się że używasz `credentials: 'include'` jeśli cookies:
```typescript
fetch('/api/workspaces', {
  credentials: 'include',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

**Rekomendacja:**
- Development: `origin: true` (any origin) dla wygody
- Production: whitelist konkretnych domen

---

### 3.4 [Rate Limiting] Brak rate limiting na login endpoint

**Lokalizacja:** Backend `/api/auth/login` (nie frontend, ale wymaga współpracy)

**Problem:**
Formularz login może być użyty do:
- Brute force attack (zgadywanie haseł)
- Credential stuffing (leaked passwords from other sites)
- Account enumeration (sprawdzenie czy email istnieje)

**Konsekwencje:**
- Unauthorized access
- DoS (wiele requestów przeciąża backend)
- OWASP A07:2021 (Identification and Authentication Failures)

**Jak naprawić:**

1. Backend (rate limiting):
```typescript
// auth.controller.ts
@Controller('auth')
export class AuthController {
  @Post('login')
  @Throttle(5, 60) // 5 prób na 60 sekund
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

2. Frontend (user feedback):
```typescript
// Login.tsx
if (response.status === 429) {
  setError('Too many login attempts. Please try again in 1 minute.');
  return;
}
```

3. Backend (progressive delay):
```typescript
// Po każdej nieudanej próbie:
const attempts = await redis.incr(`login_attempts:${email}`);
if (attempts > 5) {
  const delay = Math.min(attempts * 1000, 10000); // Max 10s
  await sleep(delay);
}
```

**Rekomendacja:**
- Rate limit: 5 prób / 1 min per IP
- After 5 failed: CAPTCHA required
- After 10 failed: account lock + email notification

---

## 4. LOW (rekomendacja)

### 4.1 [Code Quality] Brak TypeScript strict mode

**Lokalizacja:** `apps/web/tsconfig.json`

**Problem:**
Nie sprawdzono czy `strict: true` jest włączone. TypeScript strict mode wykrywa potencjalne null/undefined bugs.

**Rekomendacja:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

---

### 4.2 [Dependency Security] Brak automated dependency scanning

**Problem:**
Package.json zawiera dependencies, ale brak CI/CD pipeline do sprawdzania CVE.

**Rekomendacja:**

1. Dodaj GitHub Actions workflow:
```yaml
# .github/workflows/security.yml
name: Security Audit
on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm audit --audit-level=moderate
```

2. Użyj Dependabot:
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/apps/web"
    schedule:
      interval: weekly
```

---

### 4.3 [UX Security] Brak "Remember me" checkbox (tylko jeśli potrzebne)

**Lokalizacja:** Login.tsx

**Uwaga:** Jeśli system nie wymaga "Remember me", to OK. Ale jeśli będzie potrzebne:

**Rekomendacja:**
```typescript
const [rememberMe, setRememberMe] = useState(false);

// Po zalogowaniu:
if (rememberMe) {
  localStorage.setItem('access_token', token); // Długotrwałe
} else {
  sessionStorage.setItem('access_token', token); // Zamknięcie karty = logout
}
```

**Security trade-off:**
- localStorage = wygoda, ale token przetrwa restart
- sessionStorage = bardziej secure, ale wymaga re-login

---

### 4.4 [Code Quality] Brak error boundary

**Problem:**
Jeśli komponent rzuci exception, cała aplikacja crashuje (biały ekran).

**Rekomendacja:**
```typescript
// src/shared/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Error caught:', error, info);
    // Wyślij do Sentry
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh the page.</div>;
    }
    return this.props.children;
  }
}

// W main.tsx:
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

## 5. Pozytywne aspekty

### 5.1 Dobra struktura projektu
- Clean separation of concerns: `features/`, `shared/`
- React Router dla routing
- TypeScript dla type safety

### 5.2 Tailwind CSS
- Inline styles (CSP-friendly, brak `style=` injection)
- Brak external CSS CDN (security)

### 5.3 Vite proxy
- Development proxy `/api -> localhost:3000` zapobiega CORS issues
- Production deployment będzie wymagać CORS config, ale jest to standardowe

### 5.4 .env.example
- Dobra praktyka: placeholder values
- Brak hardcoded secrets w kodzie

### 5.5 Brak dangerouslySetInnerHTML
- React automatycznie escapuje user input
- Brak ręcznego HTML rendering (XSS protection)

### 5.6 HTML5 form attributes
- `type="email"`, `type="password"`, `required` - podstawowa walidacja
- Input placeholders dla UX

---

## 6. Podsumowanie OWASP Top 10

| OWASP Category | Status | Findings |
|----------------|--------|----------|
| A01: Broken Access Control | CRITICAL | Brak JWT token storage, brak protected routes |
| A02: Cryptographic Failures | CRITICAL | Brak HTTPS enforcement |
| A03: Injection | LOW | React auto-escapes (XSS OK), brak CSP (MEDIUM) |
| A04: Insecure Design | MEDIUM | Brak rate limiting info, brak logout token cleanup |
| A05: Security Misconfiguration | MEDIUM | Brak security headers, sourcemaps enabled |
| A06: Vulnerable Components | LOW | Brak automated scanning (recommendation) |
| A07: Auth Failures | CRITICAL | Brak token persistence, brak logout implementation |
| A08: Data Integrity | N/A | Brak file uploads w przeanalizowanym kodzie |
| A09: Logging Failures | HIGH | Console.error może leakować info |
| A10: SSRF | N/A | Brak user-provided URLs |

---

## 7. Checklist zgodności z CODE_REVIEW_SECURITY_CHECKLIST.md

### Authentication & Authorization
- [ ] Protected endpoints (frontend nie ma guards)
- [ ] JWT validation (brak implementacji)
- [ ] Workspace access (N/A - backend)

### Input Validation
- [x] HTML5 validation (basic)
- [ ] DTOs with class-validator (frontend - recommended)
- [ ] File upload validation (N/A)

### Secrets Management
- [x] Zero hardcoded secrets
- [x] .env w .gitignore
- [x] .env.example up-to-date

### Error Handling
- [ ] Error messages nie leakują details (console.error problem)
- [ ] PII nie jest logowane (OK, ale brak centralized logging)

### Frontend Security
- [x] React auto-escapes (XSS protection)
- [ ] CSRF protection (N/A jeśli JWT w header, nie cookie)
- [ ] CSP (brak)

### Dependencies
- [ ] pnpm audit (nie uruchomiono - brak lockfile w apps/web)

---

## 8. Priorytetowe akcje

### DO NATYCHMIASTOWEJ NAPRAWY (przed wdrożeniem):
1. Zaimplementuj JWT token storage i Authorization header
2. Dodaj Protected Route guard dla `/dashboard`
3. Wymuś HTTPS w production (Nginx config)
4. Usuń token przy logout

### DO NAPRAWY PRZED MERGE:
5. Dodaj Content Security Policy
6. Dodaj client-side validation w formularzu login
7. Zastąp console.error centralnym loggerem
8. Dodaj security headers (Nginx lub Vite plugin)

### NEXT ITERATION:
9. Wyłącz sourcemaps w production
10. Skonfiguruj CORS na backendzie
11. Dodaj rate limiting info/feedback
12. Dodaj dependency scanning w CI/CD

---

## 9. Kontekst ekosystemu

### Związek z backendem (ecosystem.md):

**Auth Flow powinien wyglądać tak:**
```
Frontend (Login.tsx)
  |
  v
POST /api/auth/login
  |
  v
Backend (AuthController + JwtAuthGuard)
  |
  v
Response: { access_token: "...", user: {...} }
  |
  v
Frontend: localStorage.setItem('access_token', token)
  |
  v
Kolejne requesty: Authorization: Bearer <token>
  |
  v
Backend: JwtAuthGuard -> RlsMiddleware -> UserContext
  |
  v
Prisma withCurrentUser() -> RLS policies -> workspace isolation
```

**Obecnie:**
- Frontend wysyła login request ✅
- Backend prawdopodobnie zwraca token ✅
- **Frontend NIE zapisuje tokenu** ❌
- **Brak Authorization header w kolejnych requestach** ❌
- Dashboard nie załaduje danych ❌

**Multi-tenancy (RLS) jest OK na backendzie**, ale frontend musi:
1. Przekazać token w każdym requeście
2. Backend RlsMiddleware ustawi `app.current_user_id`
3. RLS policies automatycznie filtrują workspaces

---

## 10. Rekomendacje długoterminowe

### 10.1 Auth Context + React Query
```typescript
// Zamiast fetch(), użyj React Query:
import { useQuery } from '@tanstack/react-query';

const { data: workspaces, isLoading } = useQuery({
  queryKey: ['workspaces'],
  queryFn: () => api.get('/workspaces'),
  enabled: !!user, // Tylko jeśli zalogowany
});
```

### 10.2 Centralized API client
```typescript
// src/lib/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 10.3 Security monitoring
- Sentry dla error tracking (production)
- LogRocket dla session replay (jeśli potrzebne)
- Google Analytics Events dla suspicious activity (wiele 401/403)

---

## 11. Związek z istniejącymi ADR

**Brak ADR dla frontend security** - należy stworzyć:
- `docs/adr/ADR-XXX-frontend-authentication.md`
  - Decyzja: JWT w localStorage vs httpOnly cookies
  - Trade-offs: XSS vs CSRF
  - Wybór: httpOnly cookies (bardziej secure)

- `docs/adr/ADR-XXX-frontend-security-headers.md`
  - CSP policy
  - HTTPS enforcement
  - Security headers (X-Frame-Options, etc.)

---

## 12. Kontakt

**Pytania dotyczące raportu:** Zespół Security Review
**Zgłaszanie podatności:** security@synjar.com
**Dokumentacja:** `docs/security/`

---

**Data przeglądu:** 2025-12-25
**Reviewer:** Security Reviewer Agent (Claude Opus 4.5)
**Scope:** Frontend React Application (apps/web/)
**Status:** WYMAGA NAPRAWY CRITICAL/HIGH przed deployment
