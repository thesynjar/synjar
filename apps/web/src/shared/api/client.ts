import ky from 'ky';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3101';

export interface TokenProvider {
  getAccessToken: () => string | null;
  getRefreshToken?: () => string | null;
  setTokens?: (tokens: { accessToken: string; refreshToken: string; expiresIn: number }) => void;
  clearTokens?: () => void;
  getWorkspaceId?: () => string | null;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Track if we've shown a rate limit notification recently to avoid spam
let lastRateLimitNotification = 0;
const RATE_LIMIT_NOTIFICATION_COOLDOWN = 5000; // 5 seconds

export function createApiClient(tokenProvider?: TokenProvider) {
  let refreshMutex: Promise<void> | null = null;

  return ky.create({
    prefixUrl: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    hooks: {
      beforeRequest: [
        async (request) => {
          // Wait for any ongoing refresh to complete
          if (refreshMutex) {
            await refreshMutex;
          }

          const token = tokenProvider?.getAccessToken();
          if (token) {
            // Authenticated request - JWT contains workspaceId, no header needed
            request.headers.set('Authorization', `Bearer ${token}`);
          } else {
            // Pre-auth request - use X-Workspace-ID header if workspace is selected
            const workspaceId = tokenProvider?.getWorkspaceId?.();
            if (workspaceId) {
              request.headers.set('X-Workspace-ID', workspaceId);
            }
            // If no workspaceId, request goes without header (for resolve-workspace endpoint)
          }
        },
      ],
      afterResponse: [
        async (request, _options, response) => {
          // Handle 429 Too Many Requests - show user-friendly message
          if (response.status === 429) {
            const now = Date.now();
            if (now - lastRateLimitNotification > RATE_LIMIT_NOTIFICATION_COOLDOWN) {
              lastRateLimitNotification = now;

              // Get Retry-After header (in seconds)
              const retryAfter = response.headers.get('Retry-After');
              const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 60;

              // Dispatch custom event for rate limit notification
              // This allows the app to handle rate limit UI in its own way
              window.dispatchEvent(
                new CustomEvent('api:rate-limit', {
                  detail: { retryAfterSeconds: retrySeconds },
                })
              );
            }
            // Let ky's retry handle the actual retry
            return response;
          }

          // Handle 401 Unauthorized - attempt token refresh
          if (response.status === 401 && tokenProvider?.getRefreshToken?.()) {
            const refreshToken = tokenProvider.getRefreshToken();

            if (!refreshToken) {
              // No refresh token available, clear and redirect
              tokenProvider.clearTokens?.();
              window.location.href = '/login';
              return response;
            }

            // If refresh is already in progress, wait for it
            if (refreshMutex) {
              await refreshMutex;
              // Retry the original request with potentially new token
              const newToken = tokenProvider.getAccessToken();
              if (newToken) {
                request.headers.set('Authorization', `Bearer ${newToken}`);
                return ky(request);
              }
              return response;
            }

            // Start refresh - create mutex
            refreshMutex = (async () => {
              try {
                // Use fetch directly to avoid circular dependency with apiClient
                const workspaceId = tokenProvider?.getWorkspaceId?.();
                const headers: Record<string, string> = {
                  'Content-Type': 'application/json',
                };
                if (workspaceId) {
                  headers['X-Workspace-ID'] = workspaceId;
                }
                const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ refreshToken }),
                });

                if (refreshResponse.ok) {
                  const tokens: TokenRefreshResult = await refreshResponse.json();
                  tokenProvider.setTokens?.(tokens);

                  // Dispatch custom event for successful token refresh
                  window.dispatchEvent(new CustomEvent('api:token-refreshed'));
                } else {
                  // Refresh failed - clear tokens and redirect
                  throw new Error('Token refresh failed');
                }
              } catch {
                // Clear tokens and redirect to login
                tokenProvider.clearTokens?.();
                window.location.href = '/login';
              } finally {
                refreshMutex = null; // Release mutex
              }
            })();

            await refreshMutex;

            // Retry the original request with new token
            const newToken = tokenProvider.getAccessToken();
            if (newToken) {
              request.headers.set('Authorization', `Bearer ${newToken}`);
              return ky(request);
            }
          }

          return response;
        },
      ],
    },
    timeout: 30000,
    retry: {
      limit: 2,
      methods: ['get'],
      statusCodes: [408, 429, 500, 502, 503, 504],
    },
  });
}

// Public client (no auth) for unauthenticated endpoints
export const publicApiClient = createApiClient();
