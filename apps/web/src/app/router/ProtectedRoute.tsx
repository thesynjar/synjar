import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/model';
import { LoadingSpinner } from '@/shared/ui';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute component
 *
 * Protects routes that require authentication:
 * - If loading -> show loading spinner
 * - If not authenticated -> redirect to /login
 * - If authenticated -> render children
 *
 * Preserves intended URL after login using location state.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
