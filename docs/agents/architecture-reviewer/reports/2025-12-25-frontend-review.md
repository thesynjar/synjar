# Architecture Review Report - 2025-12-25

## Architecture Review Results

### Kontekst

- **Moduł**: Community Frontend (apps/web)
- **Bounded Context**: RAG Knowledge Base (Workspace, Document, Search, PublicLink)
- **Przeczytane ADR**: Brak (katalog docs/adr nie istnieje w enterprise repo)
- **Powiązane przepływy**:
  - Autentykacja użytkownika
  - Zarządzanie workspace'ami
  - Integracja z API backendu (REST)
- **Specyfikacja**: docs/specifications/2025-12-25-frontend-deployment.md
- **Stack**: React 19, Vite 6, TypeScript 5.7, Tailwind CSS 4, React Router 7

### 🔴 CRITICAL (łamie fundamentalne zasady)

#### [TESTING] Brak testów - naruszenie TDD

**Problem**:
- W całym projekcie brak plików `*.test.tsx` lub `*.spec.tsx`
- CLAUDE.md wymaga: "Always write tests first (TDD)"
- Community CLAUDE.md wymaga: "Test behavior, not implementation"

**Naruszenie**:
```
CLAUDE.md:
"Testuj zachowanie, nie implementację; preferuj szybkie unit/integration"
"Always write tests first (TDD). Stub > mock. Don't test implementation, test behavior."
```

**Jak naprawić**:
1. Dodać testy jednostkowe dla komponentów:
   ```typescript
   // src/features/auth/Login.test.tsx
   describe('Login', () => {
     it('should submit credentials and navigate to dashboard on success', async () => {
       // Test behavior, not implementation
     });

     it('should display error message when login fails', async () => {
       // Verify error handling
     });
   });
   ```

2. Dodać testy integracyjne dla API calls:
   ```typescript
   // src/features/dashboard/Dashboard.test.tsx
   describe('Dashboard', () => {
     it('should fetch and display workspaces on mount', async () => {
       // Use real API fixtures, stub fetch
     });
   });
   ```

3. Skonfigurować Vitest (jest już w package.json):
   ```bash
   # package.json ma już "test": "vitest run"
   # Brakuje tylko implementacji testów
   ```

**Priorytet**: P0 - bez testów łamiemy fundamentalną zasadę TDD

---

#### [ARCHITECTURE] Logika biznesowa w komponentach prezentacji - Anemic Architecture

**Problem**:
- `Login.tsx` zawiera logikę autentykacji bezpośrednio w komponencie
- `Dashboard.tsx` zawiera logikę pobierania danych bezpośrednio w komponencie
- Brak warstwy `application/` (use cases, services)

**Naruszenie Clean Architecture**:
```
Domain Layer (business logic)
  ↓
Application Layer (orchestration)    ← BRAK
  ↓
Infrastructure Layer
```

**Jak naprawić**:

1. Utworzyć warstwę `application/`:
   ```typescript
   // src/application/auth/LoginUseCase.ts
   export class LoginUseCase {
     constructor(private authApi: IAuthApi) {}

     async execute(email: string, password: string): Promise<LoginResult> {
       // Validation, error handling, business logic
       const result = await this.authApi.login(email, password);
       return result;
     }
   }
   ```

2. Utworzyć adaptery API w `infrastructure/`:
   ```typescript
   // src/infrastructure/api/AuthApiAdapter.ts
   export class AuthApiAdapter implements IAuthApi {
     async login(email: string, password: string): Promise<LoginResult> {
       const response = await fetch('/api/auth/login', {
         method: 'POST',
         body: JSON.stringify({ email, password }),
       });
       // Handle response, errors, etc.
     }
   }
   ```

3. Komponenty tylko prezentują dane:
   ```typescript
   // src/features/auth/Login.tsx
   export function Login() {
     const { login, isLoading, error } = useAuth(); // Custom hook

     const handleSubmit = (e) => {
       e.preventDefault();
       login(email, password); // Delegate to use case
     };

     return <form onSubmit={handleSubmit}>...</form>;
   }
   ```

**Priorytet**: P0 - łamie Clean Architecture, utrudnia testowanie i skalowanie

---

### 🟠 HIGH (poważne naruszenie)

#### [DDD] Brak domenowych interfejsów i value objects

**Problem**:
- `Workspace` zdefiniowany jako plain interface bezpośrednio w komponencie Dashboard
- Brak walidacji, brak enkapsulacji, brak niezmienników
- Backend ma strukturę DDD (domain/workspace), frontend nie respektuje tego

**Naruszenie DDD**:
```
CLAUDE.md:
"Value Objects: Immutable, self-validating (validation in constructor)"
```

**Jak naprawić**:

1. Utworzyć value objects w `domain/`:
   ```typescript
   // src/domain/workspace/WorkspaceId.ts
   export class WorkspaceId {
     private constructor(private readonly value: string) {
       if (!value || value.length === 0) {
         throw new Error('WorkspaceId cannot be empty');
       }
     }

     static create(value: string): WorkspaceId {
       return new WorkspaceId(value);
     }

     toString(): string {
       return this.value;
     }
   }

   // src/domain/workspace/Workspace.ts
   export class Workspace {
     constructor(
       readonly id: WorkspaceId,
       readonly name: string,
       readonly description: string | null,
       readonly documentCount: number
     ) {
       // Invariants validation
       if (!name || name.length === 0) {
         throw new Error('Workspace name is required');
       }
     }
   }
   ```

2. Użyć w aplikacji:
   ```typescript
   // src/features/dashboard/Dashboard.tsx
   import { Workspace } from '../../domain/workspace/Workspace';

   const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
   ```

**Priorytet**: P1 - frontend powinien respektować bounded contexts backendu

---

#### [SOLID - SRP] Layout.tsx łączy routing, prezentację i logikę API

**Problem**:
- `Layout.tsx` zawiera:
  - Nawigację (prezentacja)
  - Logout handler (logika biznesowa)
  - Routing (Outlet)

**Naruszenie SRP**:
```
CLAUDE.md Clean Code:
"SRP: One reason to change per class"
```

**Jak naprawić**:

1. Wydzielić logout do use case:
   ```typescript
   // src/application/auth/LogoutUseCase.ts
   export class LogoutUseCase {
     async execute(): Promise<void> {
       await fetch('/api/auth/logout', { method: 'POST' });
     }
   }
   ```

2. Layout tylko prezentacja:
   ```typescript
   // src/shared/Layout.tsx
   export function Layout() {
     const { logout } = useAuth();

     return (
       <div className="min-h-screen bg-slate-900">
         <Navigation onLogout={logout} />
         <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
           <Outlet />
         </main>
       </div>
     );
   }

   // src/shared/Navigation.tsx
   function Navigation({ onLogout }: { onLogout: () => void }) {
     // Only presentation
   }
   ```

**Priorytet**: P1 - łamie SRP, utrudnia testowanie

---

#### [ERRORS] Brak obsługi błędów zgodnej z zasadami

**Problem**:
- `Login.tsx` łapie błędy ale tylko wyświetla message
- `Dashboard.tsx` tylko loguje błędy do console
- Brak kontekstu błędu, brak propagacji

**Naruszenie**:
```
CLAUDE.md Clean Code:
"Errors: Use exceptions, not return codes. Don't swallow errors, keep context"
```

**Jak naprawić**:

1. Utworzyć typed errors:
   ```typescript
   // src/domain/errors/AuthenticationError.ts
   export class AuthenticationError extends Error {
     constructor(
       message: string,
       public readonly code: string,
       public readonly statusCode: number
     ) {
       super(message);
       this.name = 'AuthenticationError';
     }
   }
   ```

2. Propagować błędy z kontekstem:
   ```typescript
   // src/infrastructure/api/AuthApiAdapter.ts
   async login(email: string, password: string): Promise<LoginResult> {
     try {
       const response = await fetch('/api/auth/login', ...);
       if (!response.ok) {
         const data = await response.json();
         throw new AuthenticationError(
           data.message || 'Login failed',
           data.code || 'UNKNOWN',
           response.status
         );
       }
       return await response.json();
     } catch (err) {
       if (err instanceof AuthenticationError) throw err;
       throw new AuthenticationError('Network error', 'NETWORK_ERROR', 0);
     }
   }
   ```

3. Obsłużyć w UI z kontekstem:
   ```typescript
   // src/features/auth/Login.tsx
   const handleSubmit = async (e) => {
     try {
       await login(email, password);
     } catch (err) {
       if (err instanceof AuthenticationError) {
         setError(`${err.message} (Code: ${err.code})`);
       } else {
         setError('An unexpected error occurred');
       }
     }
   };
   ```

**Priorytet**: P1 - utrudnia debugging i user experience

---

### 🟡 MEDIUM (do poprawy)

#### [DOCS] Brak README.md w apps/web

**Problem**:
- Community CLAUDE.md wymaga: "Przeczytaj zawsze plik README.md w product, package lub platform"
- Enterprise ma `packages/frontend/README.md`, ale community/apps/web nie ma

**Jak naprawić**:

Utworzyć `community/apps/web/README.md`:
```markdown
# Synjar Web Frontend

React application for Synjar RAG Knowledge Base.

## Stack

- React 19
- Vite 6
- TypeScript 5.7
- Tailwind CSS 4
- React Router 7

## Development

\`\`\`bash
pnpm dev  # Port 3100
\`\`\`

## Architecture

Clean Architecture with feature-based structure:

\`\`\`
src/
├── domain/           # Entities, Value Objects, Interfaces
├── application/      # Use Cases, Services
├── infrastructure/   # API adapters, external integrations
├── features/         # UI features (bounded by domain contexts)
└── shared/           # Shared UI components
\`\`\`

## Bounded Contexts

Aligned with backend:
- Workspace
- Document
- Search
- PublicLink

## Testing

\`\`\`bash
pnpm test
\`\`\`

See [Testing Strategy](../../docs/testing-strategy.md).
```

**Priorytet**: P2 - dokumentacja ułatwia onboarding

---

#### [NAMING] Hardcoded URLs w komponentach

**Problem**:
- `Layout.tsx`: `/api/auth/logout`
- `Login.tsx`: `/api/auth/login`
- `Dashboard.tsx`: `/api/workspaces`

**Naruszenie DRY i konfigurowalności**:
```
CLAUDE.md Clean Code:
"Reduce repetition: DRY"
"No magic numbers/strings"
```

**Jak naprawić**:

1. Utworzyć config:
   ```typescript
   // src/infrastructure/config/apiConfig.ts
   const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

   export const API_ENDPOINTS = {
     auth: {
       login: `${API_BASE_URL}/auth/login`,
       logout: `${API_BASE_URL}/auth/logout`,
     },
     workspaces: {
       list: `${API_BASE_URL}/workspaces`,
     },
   } as const;
   ```

2. Użyć w adapterach:
   ```typescript
   // src/infrastructure/api/AuthApiAdapter.ts
   import { API_ENDPOINTS } from '../config/apiConfig';

   async login(email: string, password: string) {
     await fetch(API_ENDPOINTS.auth.login, ...);
   }
   ```

**Priorytet**: P2 - ułatwia konfigurację środowisk

---

#### [SOLID - ISP] Brak małych interfejsów

**Problem**:
- Brak zdefiniowanych interfejsów dla API calls
- Komponenty bezpośrednio używają `fetch`

**Naruszenie ISP**:
```
CLAUDE.md:
"ISP: Small focused interfaces, not giant ones"
"DIP: Depend on abstractions (IPaymentGateway), not concretions (StripeService)"
```

**Jak naprawić**:

1. Zdefiniować małe interfejsy:
   ```typescript
   // src/domain/auth/IAuthService.ts
   export interface IAuthService {
     login(email: string, password: string): Promise<void>;
     logout(): Promise<void>;
   }

   // src/domain/workspace/IWorkspaceRepository.ts
   export interface IWorkspaceRepository {
     findAll(): Promise<Workspace[]>;
     findById(id: WorkspaceId): Promise<Workspace | null>;
   }
   ```

2. Implementować w infrastructure:
   ```typescript
   // src/infrastructure/api/WorkspaceApiRepository.ts
   export class WorkspaceApiRepository implements IWorkspaceRepository {
     async findAll(): Promise<Workspace[]> {
       const response = await fetch(API_ENDPOINTS.workspaces.list);
       const data = await response.json();
       return data.map(Workspace.fromDto);
     }
   }
   ```

3. Dependency Injection w komponentach:
   ```typescript
   // src/features/dashboard/Dashboard.tsx
   const workspaceRepo = useWorkspaceRepository(); // DI via context
   const workspaces = await workspaceRepo.findAll();
   ```

**Priorytet**: P2 - ułatwia testowanie i wymianę implementacji

---

#### [ARCHITECTURE] Brak separacji DTO vs Domain

**Problem**:
- `Workspace` interface w Dashboard.tsx to mix DTO i domeny
- Backend zwraca DTO, ale frontend bezpośrednio używa jako domain model

**Jak naprawić**:

1. Zdefiniować DTO:
   ```typescript
   // src/infrastructure/api/dto/WorkspaceDto.ts
   export interface WorkspaceDto {
     id: string;
     name: string;
     description: string | null;
     documentCount: number;
   }
   ```

2. Mapper DTO → Domain:
   ```typescript
   // src/infrastructure/api/mappers/WorkspaceMapper.ts
   export class WorkspaceMapper {
     static toDomain(dto: WorkspaceDto): Workspace {
       return new Workspace(
         WorkspaceId.create(dto.id),
         dto.name,
         dto.description,
         dto.documentCount
       );
     }
   }
   ```

3. Użyć w repository:
   ```typescript
   async findAll(): Promise<Workspace[]> {
     const dtos: WorkspaceDto[] = await fetch(...).then(r => r.json());
     return dtos.map(WorkspaceMapper.toDomain);
   }
   ```

**Priorytet**: P2 - separacja DTO od domeny chroni przed zmianami API

---

### 🟢 LOW (sugestia)

#### [NAMING] NavLink jako internal component

**Problem**:
- `NavLink` zdefiniowany na końcu `Layout.tsx`
- Nazwa może być myląca (React Router ma też `NavLink`)

**Sugestia**:
```typescript
// Rename to avoid confusion with react-router-dom NavLink
function NavigationLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="text-slate-400 hover:text-white transition-colors">
      {children}
    </Link>
  );
}
```

Lub wydzielić do `src/shared/components/NavigationLink.tsx`

**Priorytet**: P3 - minor naming improvement

---

#### [UX] Loading state w Login.tsx

**Dobra praktyka**:
- Login ma `isLoading` state i disabled button podczas logowania
- Świetne UX

**Sugestia**: Rozważyć dodanie spinner/visual feedback:
```tsx
{isLoading ? (
  <>
    <span className="inline-block animate-spin mr-2">⏳</span>
    Signing in...
  </>
) : (
  'Sign in'
)}
```

**Priorytet**: P3 - nice to have

---

### ✅ Dobre praktyki

#### 1. Feature-based structure

**Bardzo dobrze**:
```
src/
├── features/
│   ├── home/Home.tsx
│   ├── auth/Login.tsx
│   └── dashboard/Dashboard.tsx
└── shared/Layout.tsx
```

- Zgodne z bounded contexts
- Łatwe do skalowania
- Jasna separacja features

#### 2. TypeScript strict mode

**Dobrze skonfigurowane**:
```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true
}
```

Zapewnia type safety.

#### 3. Modern stack

- React 19, Vite 6, TypeScript 5.7
- Tailwind CSS 4 (Vite plugin)
- React Router 7
- Świetny wybór na 2025

#### 4. Vite config z proxy

**Dobrze**:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
}
```

Ułatwia development i unika CORS.

#### 5. Environment variables

**.env.example** z feature flags:
```
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_AUDIT_LOG=false
VITE_ENABLE_TENANT_ADMIN=false
```

Gotowe na enterprise features.

#### 6. Nginx config

**Bardzo dobra konfiguracja**:
- SPA routing (try_files)
- Cache control (assets vs index.html)
- Gzip compression
- Security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)

#### 7. Docker multi-stage build

**Optymalizacja**:
- Build stage (node:20-alpine)
- Production stage (nginx:alpine)
- Minimalna wielkość obrazu

---

### 📋 Zgodność ze specyfikacją

#### ✅ Zgodne z docs/specifications/2025-12-25-frontend-deployment.md

| Wymaganie | Status | Notatki |
|-----------|--------|---------|
| Stack: React 19 | ✅ | package.json: "react": "^19.0.0" |
| Stack: Vite 6 | ✅ | package.json: "vite": "^6.0.5" |
| Stack: TypeScript | ✅ | typescript 5.7 |
| Stack: Tailwind CSS 4 | ✅ | @tailwindcss/vite 4.0 |
| Stack: React Router 7 | ✅ | react-router-dom 7.1 |
| Port dev: 3100 | ✅ | vite.config.ts: port 3100 |
| Build output: dist/ | ✅ | vite.config.ts: outDir 'dist' |
| Struktura: features/ | ✅ | home, auth, dashboard |
| Struktura: shared/ | ✅ | Layout.tsx |
| Entry: main.tsx → App.tsx | ✅ | Routing w App.tsx |
| Feature flags | ✅ | .env.example z VITE_ENABLE_* |
| Integracja z API | ✅ | auth, workspaces endpoints |

#### ⚠️ Niezgodności ze specyfikacją

1. **Brak testów** - spec nie wymaga, ale CLAUDE.md tak
2. **Brak Clean Architecture layers** - spec zakłada, ale nie wymusza

---

### 🏢 Enterprise Data Modeling

**N/A** - frontend nie definiuje modeli danych, konsumuje API backendu.

Backend ma już DDD structure:
- `domain/workspace/`
- `domain/document/`
- `domain/search/`
- `domain/public-link/`

**Rekomendacja**: Frontend powinien respektować te bounded contexts (patrz sekcja HIGH).

---

## Podsumowanie

### Zgodność ogólna: 60%

**Zalety**:
- ✅ Nowoczesny stack zgodny ze specyfikacją
- ✅ Feature-based structure
- ✅ TypeScript strict mode
- ✅ Deployment infrastructure (Docker, nginx)
- ✅ Environment variables z feature flags

**Główne problemy**:
- 🔴 **Brak testów** - naruszenie TDD
- 🔴 **Anemic Architecture** - logika w komponentach zamiast w use cases
- 🟠 **Brak DDD patterns** - brak value objects, agregates
- 🟠 **Łamanie SRP** - komponenty robią za dużo
- 🟠 **Słaba obsługa błędów** - brak kontekstu i typed errors

### Priorytetowe akcje

1. **P0 - Dodać testy** (TDD requirement)
2. **P0 - Wprowadzić Clean Architecture** (domain, application, infrastructure layers)
3. **P1 - Value Objects i domain models** (DDD patterns)
4. **P1 - Wydzielić use cases** (odciążyć komponenty)
5. **P1 - Typed error handling** (keep context)

### Następne kroki

1. Utworzyć ADR dla frontend architecture (brak docs/adr w enterprise)
2. Aktualizować docs/ o aktualny stan frontendu (zgodnie z spec-vs-docs.md)
3. Utworzyć `community/apps/web/README.md`
4. Rozpocząć refactoring zgodnie z priorytetami P0 i P1

---

## Załączniki

### Proponowana struktura (Clean Architecture)

```
src/
├── domain/                     # Pure business logic
│   ├── workspace/
│   │   ├── Workspace.ts       # Entity/Aggregate
│   │   ├── WorkspaceId.ts     # Value Object
│   │   └── IWorkspaceRepository.ts
│   ├── auth/
│   │   └── IAuthService.ts
│   └── errors/
│       ├── AuthenticationError.ts
│       └── DomainError.ts
│
├── application/                # Use Cases (orchestration)
│   ├── auth/
│   │   ├── LoginUseCase.ts
│   │   └── LogoutUseCase.ts
│   └── workspace/
│       └── FetchWorkspacesUseCase.ts
│
├── infrastructure/             # External integrations
│   ├── api/
│   │   ├── AuthApiAdapter.ts  # Implements IAuthService
│   │   ├── WorkspaceApiRepository.ts
│   │   └── dto/
│   │       └── WorkspaceDto.ts
│   └── config/
│       └── apiConfig.ts
│
├── features/                   # UI (presentation only)
│   ├── home/
│   │   ├── Home.tsx
│   │   └── Home.test.tsx
│   ├── auth/
│   │   ├── Login.tsx
│   │   ├── Login.test.tsx
│   │   └── hooks/
│   │       └── useAuth.ts     # Custom hook for DI
│   └── dashboard/
│       ├── Dashboard.tsx
│       ├── Dashboard.test.tsx
│       └── hooks/
│           └── useWorkspaces.ts
│
├── shared/                     # Shared UI components
│   ├── Layout.tsx
│   ├── Navigation.tsx
│   └── components/
│       └── LoadingSpinner.tsx
│
├── App.tsx
├── main.tsx
└── index.css
```

### Przykład refactoringu Login.tsx

**Przed** (obecny stan):
```tsx
// Login.tsx - logika w komponencie
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setIsLoading(true);

  try {
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
  } catch (err) {
    setError(err instanceof Error ? err.message : 'An error occurred');
  } finally {
    setIsLoading(false);
  }
};
```

**Po** (Clean Architecture):
```tsx
// Login.tsx - tylko prezentacja
export function Login() {
  const { login, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      // Error handled by useAuth hook
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}

// hooks/useAuth.ts - DI use case
export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const authService = useAuthService(); // DI via context

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError('');
    try {
      await authService.login(email, password);
    } catch (err) {
      if (err instanceof AuthenticationError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { login, isLoading, error };
}

// application/auth/LoginUseCase.ts - business logic
export class LoginUseCase {
  constructor(private authApi: IAuthService) {}

  async execute(email: string, password: string): Promise<void> {
    // Validation
    if (!email || !password) {
      throw new AuthenticationError('Email and password are required', 'VALIDATION_ERROR', 400);
    }

    // Call API
    await this.authApi.login(email, password);
  }
}

// infrastructure/api/AuthApiAdapter.ts - external integration
export class AuthApiAdapter implements IAuthService {
  async login(email: string, password: string): Promise<void> {
    try {
      const response = await fetch(API_ENDPOINTS.auth.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new AuthenticationError(
          data.message || 'Login failed',
          data.code || 'UNKNOWN',
          response.status
        );
      }
    } catch (err) {
      if (err instanceof AuthenticationError) throw err;
      throw new AuthenticationError('Network error', 'NETWORK_ERROR', 0);
    }
  }
}
```

---

**Wygenerowano**: 2025-12-25
**Reviewer**: Architecture Reviewer Agent
**Specyfikacja**: docs/specifications/2025-12-25-frontend-deployment.md
