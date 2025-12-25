import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/model';

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
              <Link to="/dashboard" className="text-xl font-bold text-white">
                Synjar
              </Link>
              <div className="flex gap-4">
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/documents">Documents</NavLink>
                <NavLink to="/settings">Settings</NavLink>
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
