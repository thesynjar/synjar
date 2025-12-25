import React, { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from './authStore';
import { authApi, type LoginRequest, type AuthenticatedUser } from '../api';
import { AuthContext, type AuthContextValue } from './authContext';

interface AuthProviderProps {
  children: React.ReactNode;
}

interface InitializeSessionParams {
  refreshToken: string | null;
  accessToken: string | null;
  setTokens: (tokens: { accessToken: string; refreshToken: string; expiresIn: number }) => void;
  clearTokens: () => void;
  setUser: (user: AuthenticatedUser | null) => void;
}

async function initializeSession(params: InitializeSessionParams): Promise<void> {
  const { refreshToken, accessToken, setTokens, clearTokens, setUser } = params;

  // If we have an access token, try to fetch user data
  if (accessToken) {
    try {
      const user = await authApi.me();
      setUser(user);
      return;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch user with access token:', error);
      }
      // Access token might be expired, try refresh
    }
  }

  // If no refresh token, no session to restore
  if (!refreshToken) {
    return;
  }

  // Try to restore session using refresh token
  try {
    const response = await authApi.refresh({ refreshToken });
    setTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresIn: response.expiresIn,
    });
    setUser(response.user);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Session refresh failed:', error);
    }
    clearTokens();
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { accessToken, refreshToken, setTokens, clearTokens } = useAuthStore();
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Initialize session from refresh token on app startup
  useEffect(() => {
    initializeSession({
      refreshToken,
      accessToken,
      setTokens,
      clearTokens,
      setUser,
    }).finally(() => setIsInitializing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Combine loading states
  const isLoading = isInitializing || isLoggingIn || isLoggingOut;

  // Login handler
  const login = useCallback(
    async (credentials: LoginRequest) => {
      setError(null);
      setIsLoggingIn(true);

      try {
        const response = await authApi.login(credentials);
        setTokens({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          expiresIn: response.expiresIn,
        });
        setUser(response.user);
      } catch (err) {
        const loginError = err instanceof Error ? err : new Error('Login failed');
        setError(loginError);
        throw loginError;
      } finally {
        setIsLoggingIn(false);
      }
    },
    [setTokens]
  );

  // Logout handler
  const logout = useCallback(async () => {
    setIsLoggingOut(true);

    try {
      await authApi.logout();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Logout error:', error);
      }
    } finally {
      // Always clear tokens and user, even if API call fails
      clearTokens();
      setUser(null);
      setError(null);
      setIsLoggingOut(false);
    }
  }, [clearTokens]);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
