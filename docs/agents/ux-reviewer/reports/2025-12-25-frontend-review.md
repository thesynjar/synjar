# UX Review Report - 2025-12-25

## Kontekst

- **Specyfikacja UX:** SPEC-011 (Frontend Auth), SPEC-012 (Frontend Dashboard)
- **Persony dotknięte:** Użytkownicy końcowi (self-hosted RAG)
- **Customer Journeys:**
  - Nowy użytkownik: Landing Page → Login → Dashboard → Create Workspace
  - Powracający użytkownik: Login → Dashboard → Workspace Management
- **Zakres zmian:** Utworzenie podstawowego frontendu React (Home, Login, Dashboard, Layout)

---

## CRITICAL (blokuje użytkownika)

### 1. [Accessibility] Brak aria-labels dla interaktywnych elementów

**Problem:**
Żadne przyciski, formularze ani linki nie posiadają odpowiednich atrybutów ARIA. SVG w EmptyState nie ma `aria-label` ani `role="img"`.

**Lokalizacja:**
- `Home.tsx`: Przyciski "Get Started", "Start Free"
- `Login.tsx`: Formularz logowania
- `Dashboard.tsx`: Przycisk "New Workspace", EmptyState SVG
- `Layout.tsx`: Przycisk "Logout"

**Jak naprawić:**
```tsx
// Home.tsx (linia 10-14, 16-20, 34-38)
<Link
  to="/login"
  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
  aria-label="Log in to your account"
>
  Log in
</Link>

// Dashboard.tsx (linia 76-87) - SVG
<svg
  className="mx-auto h-12 w-12"
  fill="none"
  viewBox="0 0 24 24"
  stroke="currentColor"
  aria-hidden="true"
  role="img"
  aria-label="Empty workspace illustration"
>

// Dashboard.tsx (linia 36-38)
<button
  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
  aria-label="Create new workspace"
>
  New Workspace
</button>
```

**Impact:** WCAG 2.1 Level A failure - screen readers nie mogą opisać funkcji elementów.

---

### 2. [Accessibility] Formularze nie mają powiązanych label elementów

**Problem:**
W `Login.tsx` inputy mają `<label>` z atrybutem `htmlFor`, ale nie ma wystarczającego powiązania z opisami błędów.

**Lokalizacja:**
- `Login.tsx` (linia 56-68, 71-83)

**Jak naprawić:**
```tsx
// Login.tsx - dodać aria-describedby dla błędów
<div className="mb-4">
  <label htmlFor="email" className="block text-sm text-slate-300 mb-2">
    Email
  </label>
  <input
    id="email"
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
    placeholder="you@example.com"
    required
    aria-invalid={!!error}
    aria-describedby={error ? "login-error" : undefined}
  />
</div>

{error && (
  <div
    id="login-error"
    role="alert"
    className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm"
  >
    {error}
  </div>
)}
```

**Impact:** WCAG 2.1 Level A failure - użytkownicy screen readerów nie usłyszą komunikatów błędów.

---

### 3. [UX] Brak error state dla Dashboard.fetchWorkspaces

**Problem:**
`Dashboard.tsx` (linia 18-30) łapie błąd w `catch`, ale tylko loguje do konsoli. Użytkownik nie widzi komunikatu o błędzie.

**Lokalizacja:**
- `Dashboard.tsx` (linia 25-26)

**Jak naprawić:**
```tsx
export function Dashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = async () => {
    try {
      setError(null);
      const response = await fetch('/api/workspaces');
      if (!response.ok) {
        throw new Error('Failed to load workspaces');
      }
      const data = await response.json();
      setWorkspaces(data);
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
      setError('Could not load your workspaces. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // W render
  {error && (
    <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400" role="alert">
      {error}
      <button onClick={fetchWorkspaces} className="ml-4 underline">Retry</button>
    </div>
  )}
```

**Impact:** Użytkownik nie wie dlaczego dashboard jest pusty gdy API nie działa.

---

## HIGH (znacząco pogarsza UX)

### 4. [Usability] Brak loading state dla przycisku w Login.tsx

**Problem:**
Przycisk pokazuje tekst "Signing in..." gdy `isLoading`, ale nie ma wizualnej wskazówki (spinner).

**Lokalizacja:**
- `Login.tsx` (linia 86-92)

**Jak naprawić:**
```tsx
<button
  type="submit"
  disabled={isLoading}
  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-2"
>
  {isLoading && (
    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
  )}
  {isLoading ? 'Signing in...' : 'Sign in'}
</button>
```

**Impact:** Użytkownik nie ma pewności czy akcja jest w toku.

---

### 5. [Accessibility] Brak focus indicators dla nawigacji klawiszowej

**Problem:**
Tailwind focus states (`focus:outline-none`) usuwają domyślne wskaźniki focusu bez dodania własnych dla wszystkich interaktywnych elementów.

**Lokalizacja:**
- `Login.tsx` (linia 65, 80) - inputy mają `focus:border-blue-500` (OK)
- `Home.tsx`, `Dashboard.tsx`, `Layout.tsx` - linki i przyciski NIE MAJĄ focus ring

**Jak naprawić:**
```tsx
// Dodać focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2

// Home.tsx
<Link
  to="/login"
  className="px-4 py-2 text-slate-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
>
  Log in
</Link>

// Dashboard.tsx - wszystkie przyciski i karty
<button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2">
  New Workspace
</button>

<div className="p-6 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500" tabIndex={0}>
```

**Impact:** WCAG 2.1 Level AA failure - użytkownicy klawiatury nie widzą gdzie jest focus.

---

### 6. [Usability] WorkspaceCard nie jest interaktywny przez klawiaturę

**Problem:**
`WorkspaceCard` (Dashboard.tsx, linia 60) ma `cursor-pointer`, ale nie `onClick` ani nawigację.

**Lokalizacja:**
- `Dashboard.tsx` (linia 58-69)

**Jak naprawić:**
```tsx
function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/workspaces/${workspace.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="p-6 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Open workspace ${workspace.name}`}
    >
      <h3 className="text-lg font-semibold text-white mb-2">{workspace.name}</h3>
      {workspace.description && (
        <p className="text-slate-400 text-sm mb-4">{workspace.description}</p>
      )}
      <div className="text-slate-500 text-sm">
        {workspace.documentCount} documents
      </div>
    </div>
  );
}
```

**Impact:** Użytkownicy klawiatury/screen readerów nie mogą otworzyć workspace.

---

### 7. [Usability] Brak walidacji w czasie rzeczywistym dla Login.tsx

**Problem:**
Formularz pokazuje błędy tylko po submit. Nie ma client-side validation (np. email format).

**Lokalizacja:**
- `Login.tsx` (linia 56-83)

**Jak naprawić:**
Używać biblioteki jak `react-hook-form` + `zod` (zgodnie z SPEC-011):

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur', // walidacja po opuszczeniu pola
  });

  const onSubmit = async (data: LoginFormData) => {
    // ... reszta kodu
  };

  return (
    // ... formularz z errors.email?.message, errors.password?.message
  );
}
```

**Impact:** Użytkownik dowiaduje się o błędach za późno.

---

### 8. [Performance] Brak debounce dla potencjalnych search/filter

**Problem:**
Choć obecnie nie ma wyszukiwania, Dashboard będzie potrzebował filtrowania workspace'ów.

**Rekomendacja:**
Przygotować utility hook dla przyszłych feature'ów:

```tsx
// src/shared/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

**Impact:** LOW teraz, HIGH gdy dodamy search.

---

## MEDIUM (drobne problemy UX)

### 9. [Consistency] Niespójne nazewnictwo przycisków

**Problem:**
- Home.tsx: "Get Started", "Start Free" (dwa przyciski do tego samego miejsca)
- Dashboard.tsx: "New Workspace" vs EmptyState "Create Workspace"

**Lokalizacja:**
- `Home.tsx` (linia 16, 34)
- `Dashboard.tsx` (linia 36, 94)

**Jak naprawić:**
- Home: Jeden przycisk "Get Started" (główny CTA), drugi "View Documentation"
- Dashboard: Konsekwentnie "Create Workspace" wszędzie

---

### 10. [Usability] Brak "Remember me" w Login.tsx

**Problem:**
SPEC-011 wspomina o "Remember me" checkbox, ale nie jest zaimplementowane.

**Lokalizacja:**
- `Login.tsx` (brak w liniach 46-100)

**Jak naprawić:**
```tsx
const [rememberMe, setRememberMe] = useState(false);

// W formularzu przed przyciskiem submit
<div className="flex items-center mb-6">
  <input
    id="remember-me"
    type="checkbox"
    checked={rememberMe}
    onChange={(e) => setRememberMe(e.target.checked)}
    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-700 rounded"
  />
  <label htmlFor="remember-me" className="ml-2 text-sm text-slate-300">
    Remember me
  </label>
</div>

// W handleSubmit przekazać do API
body: JSON.stringify({ email, password, rememberMe }),
```

**Impact:** Użytkownik musi się logować za każdym razem.

---

### 11. [Accessibility] Brak skip link

**Problem:**
Nawigacja klawiszowa wymaga przechodzenia przez cały navbar. Brak "Skip to main content".

**Lokalizacja:**
- `Layout.tsx` (brak przed nawigacją)

**Jak naprawić:**
```tsx
// Na początku Layout.tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-lg z-50"
>
  Skip to main content
</a>

// W main
<main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <Outlet />
</main>
```

**Impact:** Użytkownicy screen readerów tracą czas na nawigacji.

---

### 12. [UX] Brak breadcrumbs/wskaźnika gdzie użytkownik jest

**Problem:**
W `Layout.tsx` nie ma wizualnego wskaźnika aktywnego linku w nawigacji.

**Lokalizacja:**
- `Layout.tsx` (linia 47-55) - NavLink

**Jak naprawić:**
```tsx
import { useLocation } from 'react-router-dom';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`${
        isActive
          ? 'text-white border-b-2 border-blue-500'
          : 'text-slate-400 hover:text-white'
      } transition-colors pb-1`}
      aria-current={isActive ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
```

**Impact:** Użytkownik nie wie gdzie jest w aplikacji.

---

### 13. [Usability] EmptyState w Dashboard nie jest centred vertically

**Problem:**
EmptyState (Dashboard.tsx, linia 72-98) pokazuje się na górze, nie w centrum ekranu.

**Lokalizacja:**
- `Dashboard.tsx` (linia 45-46)

**Jak naprawić:**
```tsx
{workspaces.length === 0 ? (
  <div className="flex items-center justify-center min-h-[60vh]">
    <EmptyState />
  </div>
) : (
  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    {workspaces.map((workspace) => (
      <WorkspaceCard key={workspace.id} workspace={workspace} />
    ))}
  </div>
)}
```

**Impact:** Wygląda nieprofesjonalnie.

---

### 14. [Accessibility] Kontrast kolorów może być niewystarczający

**Problem:**
`text-slate-400` na `bg-slate-900` może nie spełniać WCAG AA (4.5:1).

**Lokalizacja:**
- `Home.tsx` (linia 28, 74)
- `Dashboard.tsx` (linia 63, 91)
- `Layout.tsx` (linia 51)

**Jak naprawić:**
Sprawdzić kontrast z narzędziem jak [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/).
Jeśli niewystarczający, użyć `text-slate-300` dla tekstu pomocniczego.

```tsx
// Zamiast text-slate-400
<p className="text-slate-300 mt-2">Sign in to your account</p>
```

**Impact:** WCAG 2.1 Level AA failure - tekst może być nieczytelny dla osób z problemami wzroku.

---

## LOW (nice to have)

### 15. [UX] Brak animacji transitions dla modal/dialog

**Problem:**
Brak animowanych przejść dla przyszłych modali (Create Workspace będzie modalem wg SPEC-012).

**Rekomendacja:**
Użyć biblioteki jak `@headlessui/react` lub `radix-ui` dla accessibility + animations.

```tsx
// SPEC-012 zakłada Dialog - przygotować infrastrukturę
import { Dialog, Transition } from '@headlessui/react';

export function Modal({ open, onClose, children }) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose}>
        <Transition.Child
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>
        {/* Dialog content */}
      </Dialog>
    </Transition>
  );
}
```

---

### 16. [Performance] Brak lazy loading dla route components

**Problem:**
`App.tsx` importuje wszystkie komponenty statycznie.

**Lokalizacja:**
- `App.tsx` (linia 2-5)

**Jak naprawić:**
```tsx
import { lazy, Suspense } from 'react';

const Home = lazy(() => import('./features/home/Home').then(m => ({ default: m.Home })));
const Login = lazy(() => import('./features/auth/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* ... */}
      </Routes>
    </Suspense>
  );
}
```

**Impact:** Nieznaczny dla MVP, ważne gdy app urośnie.

---

### 17. [UX] Brak progress indicator dla multi-step flows

**Problem:**
Przyszłe flow (rejestracja, onboarding) będą wieloetapowe. Brak komponentu progress bar.

**Rekomendacja:**
Przygotować reusable component:

```tsx
// src/shared/components/ProgressSteps.tsx
export function ProgressSteps({
  steps,
  currentStep
}: {
  steps: string[];
  currentStep: number;
}) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center">
            <span className={`${
              index < currentStep ? 'bg-blue-600 text-white' :
              index === currentStep ? 'bg-blue-600 text-white' :
              'bg-slate-700 text-slate-400'
            } w-8 h-8 rounded-full flex items-center justify-center`}>
              {index + 1}
            </span>
            {index < steps.length - 1 && (
              <div className="w-12 h-0.5 bg-slate-700 mx-2" />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

---

### 18. [Consistency] Brak design system documentation

**Problem:**
Kolory (`bg-blue-600`, `text-slate-400`) są hardcoded. Brak centralnej konfiguracji.

**Rekomendacja:**
Stworzyć `tailwind.config.js` z custom theme:

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        background: {
          primary: '#0f172a', // slate-900
          secondary: '#1e293b', // slate-800
        },
      },
    },
  },
};

// Użycie: bg-primary-600, text-background-primary
```

---

## Pozytywne aspekty UX

1. **Spójny dark theme** - przyjemny dla oczu, profesjonalny wygląd
2. **Responsywny grid** - `md:grid-cols-2 lg:grid-cols-3` w Dashboard
3. **Loading states** - spinner w Dashboard, disabled button w Login
4. **Empty state** - Dashboard pokazuje pomocny komunikat gdy brak workspace'ów
5. **Error feedback** - Login pokazuje błędy w czerwonym alert boxie
6. **Semantic HTML** - użycie `<nav>`, `<main>`, `<form>`, `<button>`
7. **TypeScript** - typy dla Workspace interface zapewniają spójność
8. **Transition effects** - `hover:bg-blue-700`, `transition-colors`

---

## Rekomendacje

### Obszar: Usability

1. **Priorytet 1:** Dodać error handling dla wszystkich fetch calls
2. **Priorytet 1:** Zaimplementować client-side validation (react-hook-form + zod)
3. **Priorytet 2:** Dodać visual loading indicators (spinners) wszędzie
4. **Priorytet 2:** Dodać active state indicators w nawigacji
5. **Priorytet 3:** Zaimplementować "Remember me" w Login

### Obszar: Accessibility

1. **Priorytet 1:** Dodać aria-labels do wszystkich interaktywnych elementów
2. **Priorytet 1:** Dodać focus-visible ring do wszystkich focusable elements
3. **Priorytet 1:** Naprawić keyboard navigation (WorkspaceCard)
4. **Priorytet 1:** Dodać aria-describedby dla error messages
5. **Priorytet 2:** Dodać skip link
6. **Priorytet 2:** Sprawdzić kontrast kolorów (WCAG AA)
7. **Priorytet 3:** Dodać role="alert" dla wszystkich error/success messages

### Obszar: Consistency

1. **Priorytet 1:** Zunifikować nazewnictwo przycisków (Create vs New)
2. **Priorytet 2:** Utworzyć design system w tailwind.config.js
3. **Priorytet 2:** Utworzyć reusable components (Button, Input, Alert)
4. **Priorytet 3:** Dokumentacja design tokens

### Obszar: Performance

1. **Priorytet 2:** Dodać lazy loading dla route components
2. **Priorytet 3:** Przygotować debounce hook dla przyszłych search features

---

## Podsumowanie

### Zgodność ze specyfikacją

| Aspekt | SPEC-011 | SPEC-012 | Implementacja | Status |
|--------|----------|----------|---------------|--------|
| Login Page | ✓ | - | Zaimplementowane | ⚠️ Brakuje react-hook-form, remember me |
| Dashboard | - | ✓ | Zaimplementowane | ⚠️ Brakuje error handling |
| EmptyState | - | ✓ | Zaimplementowane | ✓ OK |
| Loading States | ✓ | ✓ | Częściowo | ⚠️ Brakuje spinnerów |
| Layout/Navigation | - | ✓ | Zaimplementowane | ⚠️ Brak active state |
| Accessibility | ✓ | ✓ | NIE | ❌ Krytyczne braki |
| Responsive | ✓ | ✓ | Zaimplementowane | ✓ OK |
| Validation | ✓ | - | NIE | ❌ Tylko HTML5 required |

### Najważniejsze działania

**MUST DO przed merging:**
1. Dodać aria-labels i role attributes (CRITICAL #1, #2)
2. Dodać error handling w Dashboard (CRITICAL #3)
3. Naprawić keyboard navigation (HIGH #6)
4. Dodać focus-visible rings (HIGH #5)

**SHOULD DO w najbliższym czasie:**
1. Zaimplementować react-hook-form + zod validation (HIGH #7)
2. Dodać active state w nawigacji (MEDIUM #12)
3. Dodać skip link (MEDIUM #11)
4. Sprawdzić kontrast kolorów (MEDIUM #14)

**CAN DO później:**
1. Lazy loading (LOW #16)
2. Animations dla modali (LOW #15)
3. Design system documentation (LOW #18)

---

## Zgodność z WCAG 2.1

| Kryterium | Level | Status | Problemy |
|-----------|-------|--------|----------|
| 1.1.1 Non-text Content | A | ❌ FAIL | SVG bez aria-label (#1) |
| 1.3.1 Info and Relationships | A | ⚠️ PARTIAL | Labels OK, aria-describedby brak (#2) |
| 2.1.1 Keyboard | A | ❌ FAIL | WorkspaceCard (#6) |
| 2.4.3 Focus Order | A | ✓ PASS | - |
| 2.4.7 Focus Visible | AA | ❌ FAIL | Brak focus rings (#5) |
| 3.2.4 Consistent Identification | AA | ⚠️ PARTIAL | Niespójne nazwy (#9) |
| 3.3.1 Error Identification | A | ⚠️ PARTIAL | Błędy widoczne, brak aria (#2) |
| 3.3.2 Labels or Instructions | A | ✓ PASS | - |
| 4.1.2 Name, Role, Value | A | ❌ FAIL | Brak aria-labels (#1) |
| 1.4.3 Contrast | AA | ⚠️ NEEDS CHECK | text-slate-400 (#14) |

**Ocena ogólna:** Aplikacja NIE SPEŁNIA WCAG 2.1 Level A w obecnej formie.

---

## Next Steps

1. Implementować CRITICAL fixes (#1, #2, #3)
2. Code review z fokusem na accessibility
3. Testy manualne z:
   - Screen reader (VoiceOver/NVDA)
   - Tylko klawiatura (bez myszy)
   - Kontrast (WebAIM checker)
4. Zaimplementować HIGH priority fixes (#4, #5, #6, #7)
5. Dodać automated accessibility tests (jest-axe, @testing-library/a11y)
6. Zaktualizować dokumentację o accessibility guidelines

---

## Przydatne linki

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [React Accessibility Docs](https://react.dev/learn/accessibility)
- [Tailwind CSS Accessibility](https://tailwindcss.com/docs/screen-readers)
