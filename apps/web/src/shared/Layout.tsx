import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/model';
import {
  ToastContainer,
  UserMenu,
  WorkspaceSwitcher,
  MainNav,
  MobileNav,
  NavigationErrorBoundary,
} from '@/shared/ui';
import { WorkspaceUIProvider } from '@/shared/contexts';

/**
 * Layout - Main application layout with adaptive navigation
 *
 * Phase 2 Navigation Redesign:
 * - Single workspace: Shows workspace name + main nav (Documents | Search Links | Sets)
 * - Multi-workspace: Shows workspace dropdown + main nav
 * - Mobile: Hamburger menu with slide-out navigation
 *
 * See: docs/specifications/2025-12-30-navigation-redesign.md
 */
export function Layout() {
  const { user, logout, isLoading } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <NavigationErrorBoundary>
      <WorkspaceUIProvider>
        <div className="min-h-screen bg-slate-900">
          {/* Skip navigation link for accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded"
          >
            Skip to main content
          </a>

          <nav className="bg-slate-800 border-b border-slate-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                {/* Left section: Mobile hamburger, Logo, Workspace, MainNav */}
                <div className="flex items-center gap-4 lg:gap-6">
                  {/* Mobile hamburger - only visible on small screens */}
                  <MobileNav />

                  {/* Logo */}
                  <Link to="/workspaces" className="flex items-center">
                    <img src="/logo.svg" alt="Synjar" className="h-8" />
                  </Link>

                  {/* Desktop: Workspace + MainNav - hidden on mobile */}
                  <div className="hidden lg:flex items-center gap-6">
                    <WorkspaceSwitcher />
                    <MainNav />
                  </div>
                </div>

                {/* Right section: User Menu */}
                <div className="flex items-center gap-4">
                  {user && (
                    <UserMenu
                      user={user}
                      onLogout={handleLogout}
                      isLoggingOut={isLoading}
                    />
                  )}
                </div>
              </div>
            </div>
          </nav>

          <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Outlet />
          </main>

          <ToastContainer />
        </div>
      </WorkspaceUIProvider>
    </NavigationErrorBoundary>
  );
}
