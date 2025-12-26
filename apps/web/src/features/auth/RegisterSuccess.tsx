import { Link, useLocation } from 'react-router-dom';

export function RegisterSuccess() {
  const location = useLocation();
  const email = (location.state as { email?: string })?.email;

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <Link to="/" className="text-3xl font-bold text-white">
            Synjar
          </Link>
        </div>

        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-4">Check your email</h2>

          <p className="text-slate-400 mb-6">
            We've sent a verification link to{' '}
            {email ? (
              <span className="text-white font-medium">{email}</span>
            ) : (
              'your email address'
            )}
            . Click the link to activate your account.
          </p>

          <p className="text-slate-500 text-sm mb-6">
            Didn't receive the email? Check your spam folder or try signing up again.
          </p>

          <Link
            to="/login"
            className="inline-block w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-semibold transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
