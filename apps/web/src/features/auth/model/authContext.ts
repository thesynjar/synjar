import { createContext } from 'react';
import type { AuthenticatedUser, LoginRequest } from '../api';

export interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  error: Error | null;
  setUser: (user: AuthenticatedUser | null) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);
