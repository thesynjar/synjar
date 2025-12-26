import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi, ApiError } from './api';

type VerificationState = 'loading' | 'success' | 'error';

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<VerificationState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('Invalid verification link');
      return;
    }

    const verifyEmail = async () => {
      try {
        await authApi.verifyEmail({ token });
        setState('success');
      } catch (error) {
        setState('error');
        if (error instanceof ApiError) {
          const body = error.body as { message?: string } | undefined;
          setErrorMessage(body?.message || 'Verification failed');
        } else {
          setErrorMessage('An unexpected error occurred');
        }
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <Link to="/" className="text-3xl font-bold text-white">
            Synjar
          </Link>
        </div>

        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700">
          {state === 'loading' && (
            <>
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-white mb-4">Verifying your email...</h2>
              <p className="text-slate-400">Please wait while we verify your email address.</p>
            </>
          )}

          {state === 'success' && (
            <>
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-white mb-4">Email verified!</h2>
              <p className="text-slate-400 mb-6">
                Your email has been verified successfully. You can now sign in to your account.
              </p>

              <Link
                to="/login"
                className="inline-block w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors"
              >
                Sign in
              </Link>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-8 h-8 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-white mb-4">Verification failed</h2>
              <p className="text-slate-400 mb-6">{errorMessage}</p>

              <Link
                to="/register"
                className="inline-block w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-semibold transition-colors"
              >
                Try signing up again
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
