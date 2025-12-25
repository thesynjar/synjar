import { ReactNode } from 'react';
import { QueryProvider } from './QueryProvider';
import { AuthProvider } from '@/features/auth/model';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Providers composition
 *
 * Order matters:
 * 1. QueryProvider - TanStack Query for data fetching
 * 2. AuthProvider - Authentication state (uses Query for API calls)
 * 3. Children (contains BrowserRouter in main.tsx)
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <QueryProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryProvider>
  );
}
