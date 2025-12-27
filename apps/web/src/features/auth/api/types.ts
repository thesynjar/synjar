export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  workspaceName: string;
  name?: string;
}

export interface RegisterResponse {
  message: string;
  userId: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface MessageResponse {
  message: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}
