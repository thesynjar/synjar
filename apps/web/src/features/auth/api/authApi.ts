import type {
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  AuthenticatedUser,
  RegisterRequest,
  RegisterResponse,
  VerifyEmailRequest,
  MessageResponse,
} from './types';

const BASE_URL = import.meta.env.VITE_API_URL || '';
const API_URL = `${BASE_URL}/api/v1`;

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(
      `HTTP error ${response.status}`,
      response.status,
      body
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return headers;
}

export const authApi = {
  async register(request: RegisterRequest): Promise<RegisterResponse> {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return handleResponse<RegisterResponse>(response);
  },

  async verifyEmail(request: VerifyEmailRequest): Promise<MessageResponse> {
    const response = await fetch(`${API_URL}/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return handleResponse<MessageResponse>(response);
  },

  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return handleResponse<LoginResponse>(response);
  },

  async logout(): Promise<void> {
    const response = await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    return handleResponse<void>(response);
  },

  async refresh(request: RefreshRequest): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return handleResponse<LoginResponse>(response);
  },

  async me(): Promise<AuthenticatedUser> {
    const response = await fetch(`${API_URL}/auth/me`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return handleResponse<AuthenticatedUser>(response);
  },
};

export { ApiError };
