# SPEC-011: Frontend - Auth

**Data:** 2025-12-24
**Status:** Draft
**Priorytet:** P0 (Foundation)
**Zależności:** Backend API (existing)

---

## 1. Cel biznesowy

Implementacja podstawowego flow autentykacji w React: login, rejestracja, zarządzanie sesją.

### Wartość MVP

- User może się zarejestrować i zalogować
- Sesja utrzymywana przez JWT
- Automatyczne odświeżanie tokenu
- Ochrona routów dla zalogowanych

---

## 2. Wymagania funkcjonalne

### 2.1 Strony

| Strona | URL | Dostęp |
|--------|-----|--------|
| Login | /login | Public |
| Register | /register | Public |
| Forgot Password | /forgot-password | Public (v2) |

### 2.2 Funkcjonalności

1. **Login**
   - Email + password
   - "Remember me" checkbox
   - Link do rejestracji
   - Error handling

2. **Register**
   - Email + password + name
   - Password confirmation
   - Terms of service checkbox
   - Link do logowania

3. **Session management**
   - JWT w HTTP-only cookies (backend)
   - Auto-refresh przed wygaśnięciem
   - Logout (clear cookies)
   - Redirect po login/logout

---

## 3. Stack technologiczny

| Technologia | Użycie |
|-------------|--------|
| React 18 | UI Framework |
| Vite | Build tool |
| React Router 6 | Routing |
| TanStack Query | Data fetching |
| Tailwind CSS | Styling |
| React Hook Form | Forms |
| Zod | Validation |
| Axios | HTTP client |

---

## 4. Implementacja

### 4.1 Struktura plików

```
apps/web/src/
├── main.tsx
├── App.tsx
├── routes.tsx
├── features/
│   └── auth/
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   └── RegisterPage.tsx
│       ├── components/
│       │   ├── LoginForm.tsx
│       │   ├── RegisterForm.tsx
│       │   └── AuthLayout.tsx
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   └── useCurrentUser.ts
│       ├── api/
│       │   └── auth.api.ts
│       └── types.ts
├── shared/
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── FormField.tsx
│   │   └── Alert.tsx
│   ├── hooks/
│   │   └── useApi.ts
│   └── lib/
│       ├── api-client.ts
│       └── auth-context.tsx
└── types/
    └── api.ts
```

### 4.2 Auth Context

```typescript
// src/shared/lib/auth-context.tsx

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const response = await apiClient.get('/auth/me');
      setUser(response.data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await apiClient.post('/auth/login', { email, password });
    setUser(response.data.user);
    queryClient.clear(); // Clear cache on login
  };

  const register = async (data: RegisterData) => {
    const response = await apiClient.post('/auth/register', data);
    setUser(response.data.user);
  };

  const logout = async () => {
    await apiClient.post('/auth/logout');
    setUser(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### 4.3 API Client z auto-refresh

```typescript
// src/shared/lib/api-client.ts

import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true, // Send cookies
});

// Response interceptor for token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh token
        await axios.post(
          `${apiClient.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        // Retry original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export { apiClient };
```

### 4.4 Login Form

```typescript
// src/features/auth/components/LoginForm.tsx

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/shared/lib/auth-context';
import { useNavigate } from 'react-router-dom';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError(null);
      await login(data.email, data.password);
      navigate('/');
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <Alert variant="error">{error}</Alert>
      )}

      <FormField
        label="Email"
        error={errors.email?.message}
      >
        <Input
          type="email"
          {...register('email')}
          placeholder="you@example.com"
        />
      </FormField>

      <FormField
        label="Password"
        error={errors.password?.message}
      >
        <Input
          type="password"
          {...register('password')}
          placeholder="••••••••"
        />
      </FormField>

      <Button
        type="submit"
        loading={isSubmitting}
        className="w-full"
      >
        Sign in
      </Button>

      <p className="text-center text-sm text-gray-600">
        Don't have an account?{' '}
        <Link to="/register" className="text-blue-600 hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
```

### 4.5 Protected Route

```typescript
// src/shared/components/ProtectedRoute.tsx

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/shared/lib/auth-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
```

### 4.6 Routes

```typescript
// src/routes.tsx

import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/shared/components/ProtectedRoute';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';

export const router = createBrowserRouter([
  // Public routes
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },

  // Protected routes
  {
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { path: '/', element: <DashboardPage /> },
      // ... more routes
    ],
  },
]);
```

---

## 5. UI/UX

### 5.1 Login Page mockup

```
┌─────────────────────────────────────────┐
│                                         │
│           Synjar                        │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │  Sign in to your account        │    │
│  │                                 │    │
│  │  Email                          │    │
│  │  ┌─────────────────────────┐    │    │
│  │  │ you@example.com         │    │    │
│  │  └─────────────────────────┘    │    │
│  │                                 │    │
│  │  Password                       │    │
│  │  ┌─────────────────────────┐    │    │
│  │  │ ••••••••                │    │    │
│  │  └─────────────────────────┘    │    │
│  │                                 │    │
│  │  ┌─────────────────────────┐    │    │
│  │  │      Sign in            │    │    │
│  │  └─────────────────────────┘    │    │
│  │                                 │    │
│  │  Don't have an account? Sign up │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

### 5.2 Design tokens

```css
/* Tailwind config extensions */
colors: {
  primary: {
    50: '#f0f9ff',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
  }
}

/* Form styling */
.input {
  @apply w-full px-3 py-2 border border-gray-300 rounded-md
         focus:outline-none focus:ring-2 focus:ring-primary-500
         focus:border-transparent;
}

.btn-primary {
  @apply px-4 py-2 bg-primary-600 text-white rounded-md
         hover:bg-primary-700 focus:outline-none focus:ring-2
         focus:ring-primary-500 focus:ring-offset-2
         disabled:opacity-50 disabled:cursor-not-allowed;
}
```

---

## 6. Testy

### 6.1 Unit tests

```typescript
// src/features/auth/components/LoginForm.test.tsx

describe('LoginForm', () => {
  it('shows validation errors for empty fields', async () => {
    render(<LoginForm />);

    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });

  it('calls login on valid submit', async () => {
    const mockLogin = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ login: mockLogin, ... });

    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('shows error on failed login', async () => {
    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn().mockRejectedValue(new Error('Invalid credentials')),
      ...
    });

    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
  });
});
```

---

## 7. Definition of Done

- [ ] Project setup (Vite + React + TypeScript)
- [ ] Tailwind CSS configuration
- [ ] API client z credentials i interceptors
- [ ] AuthContext + useAuth hook
- [ ] LoginPage + LoginForm
- [ ] RegisterPage + RegisterForm
- [ ] ProtectedRoute component
- [ ] Router configuration
- [ ] Unit testy dla formularzy
- [ ] E2E test login flow

---

## 8. Estymacja

| Zadanie | Złożoność |
|---------|-----------|
| Project setup | S |
| Auth context | M |
| Login page | S |
| Register page | S |
| Protected routes | S |
| Testy | M |
| **TOTAL** | **M** |

---

## 9. Następna specyfikacja

Po wdrożeniu: **SPEC-012: Frontend - Dashboard**
