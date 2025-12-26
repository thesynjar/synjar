import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, ApiError } from './api';

interface FormErrors {
  email?: string;
  password?: string;
  workspaceName?: string;
  general?: string;
}

export function Register() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const validatePassword = (pwd: string): string | undefined => {
    if (pwd.length < 12) {
      return 'Password must be at least 12 characters long';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/\d/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    if (!/[@$!%*?&]/.test(pwd)) {
      return 'Password must contain at least one special character (@$!%*?&)';
    }
    return undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const passwordError = validatePassword(password);
    if (passwordError) {
      setErrors({ password: passwordError });
      return;
    }

    if (workspaceName.length < 2) {
      setErrors({ workspaceName: 'Workspace name must be at least 2 characters' });
      return;
    }

    setIsLoading(true);

    try {
      await authApi.register({
        email,
        password,
        workspaceName,
        name: name || undefined,
      });
      navigate('/register/success', { state: { email } });
    } catch (error) {
      if (error instanceof ApiError) {
        const body = error.body as { message?: string | string[] } | undefined;
        const message = Array.isArray(body?.message)
          ? body.message.join(', ')
          : body?.message || 'Registration failed';
        setErrors({ general: message });
      } else {
        setErrors({ general: 'An unexpected error occurred' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-3xl font-bold text-white">
            Synjar
          </Link>
          <p className="text-slate-400 mt-2">Create your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-800 rounded-xl p-8 border border-slate-700"
        >
          {errors.general && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {errors.general}
            </div>
          )}

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
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-400">{errors.email}</p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="name" className="block text-sm text-slate-300 mb-2">
              Name <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="John Doe"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="workspaceName" className="block text-sm text-slate-300 mb-2">
              Workspace name
            </label>
            <input
              id="workspaceName"
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="My Knowledge Base"
              required
            />
            {errors.workspaceName && (
              <p className="mt-1 text-sm text-red-400">{errors.workspaceName}</p>
            )}
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="block text-sm text-slate-300 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Min. 12 characters"
              required
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-400">{errors.password}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Must contain uppercase, lowercase, number, and special character (@$!%*?&)
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 rounded-lg text-white font-semibold transition-colors"
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-slate-400 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
