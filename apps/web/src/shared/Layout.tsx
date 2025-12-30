import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/model';
import { config } from '@/shared/config';
import { ToastContainer } from '@/shared/ui';

export function Layout() {
  const { user, logout, isLoading } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/workspaces" className="flex items-center">
                <img src="/logo.svg" alt="Synjar" className="h-8" />
              </Link>
              <div className="flex gap-4">
                <NavLink to="/workspaces">Workspaces</NavLink>
                <NavLink to="/settings">Settings</NavLink>
                <a
                  href={config.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Docs
                </a>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <span className="text-slate-400 text-sm">
                  {user.email}
                </span>
              )}
              <button
                onClick={handleLogout}
                disabled={isLoading}
                className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Logging out...' : 'Logout'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="text-slate-400 hover:text-white transition-colors"
    >
      {children}
    </Link>
  );
}
