import { create } from 'zustand';

interface AuthTokens {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  workspaceId: string | null;
}

interface AuthStore extends AuthTokens {
  setTokens: (tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }) => void;
  setWorkspaceId: (workspaceId: string) => void;
  clearTokens: () => void;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  getWorkspaceId: () => string | null;
  isAuthenticated: () => boolean;
}

const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const WORKSPACE_ID_KEY = 'auth_workspace_id';

/**
 * Load value from localStorage with error handling.
 * Returns null if localStorage is not available (SSR) or on error.
 */
const loadFromStorage = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Save value to localStorage with error handling.
 * Logs errors in development mode only.
 */
const saveToStorage = (key: string, value: string): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error(`Failed to save ${key}:`, error);
    }
  }
};

/**
 * Remove value from localStorage with error handling.
 * Logs errors in development mode only.
 */
const removeFromStorage = (key: string): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error(`Failed to remove ${key}:`, error);
    }
  }
};

/**
 * Auth store for managing authentication state.
 *
 * Security considerations:
 * - Access token is stored only in memory (not persisted) - protects against XSS
 * - Refresh token is stored in localStorage for session persistence
 * - Workspace ID is stored in localStorage for user convenience
 *
 * Usage:
 * ```tsx
 * const { accessToken, setTokens, clearTokens, isAuthenticated } = useAuthStore();
 *
 * // After login
 * setTokens({ accessToken: 'jwt...', refreshToken: 'refresh...', expiresIn: 3600 });
 *
 * // Check auth status
 * if (isAuthenticated()) { ... }
 *
 * // On logout
 * clearTokens();
 * ```
 */
export const useAuthStore = create<AuthStore>((set, get) => ({
  // Initial state - load persistent values from localStorage
  // Access token only in memory (not persisted for security)
  accessToken: null,
  refreshToken: loadFromStorage(REFRESH_TOKEN_KEY),
  expiresIn: null,
  workspaceId: loadFromStorage(WORKSPACE_ID_KEY),

  /**
   * Set authentication tokens after successful login or token refresh.
   * Refresh token is persisted to localStorage for session persistence.
   * Access token is kept only in memory for security.
   */
  setTokens: (tokens) => {
    // Save refresh token to localStorage for persistence
    saveToStorage(REFRESH_TOKEN_KEY, tokens.refreshToken);

    // Update store state (access token only in memory)
    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  },

  /**
   * Set the current workspace ID.
   * Persisted to localStorage for user convenience across sessions.
   */
  setWorkspaceId: (workspaceId) => {
    saveToStorage(WORKSPACE_ID_KEY, workspaceId);
    set({ workspaceId });
  },

  /**
   * Clear all authentication state (logout).
   * Removes tokens from both memory and localStorage.
   */
  clearTokens: () => {
    // Remove tokens and workspace from localStorage
    removeFromStorage(REFRESH_TOKEN_KEY);
    removeFromStorage(WORKSPACE_ID_KEY);

    // Clear store state
    set({
      accessToken: null,
      refreshToken: null,
      expiresIn: null,
      workspaceId: null,
    });
  },

  /**
   * Get current access token (for API requests).
   */
  getAccessToken: () => get().accessToken,

  /**
   * Get current refresh token (for token refresh flow).
   */
  getRefreshToken: () => get().refreshToken,

  /**
   * Get current workspace ID.
   */
  getWorkspaceId: () => get().workspaceId,

  /**
   * Check if user is authenticated.
   * User is considered authenticated if they have either:
   * - A valid access token in memory, OR
   * - A refresh token that can be used to obtain a new access token
   */
  isAuthenticated: () => {
    const state = get();
    return state.accessToken !== null || state.refreshToken !== null;
  },
}));
