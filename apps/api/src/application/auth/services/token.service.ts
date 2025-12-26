import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthConstants } from '@/infrastructure/config/constants';

/**
 * TokenService - JWT Token Generation
 *
 * Centralized service for generating JWT access and refresh tokens.
 * Prevents duplication across use cases and ensures consistent token configuration.
 *
 * Token Lifetimes:
 * - Access Token: 15 minutes
 * - Refresh Token: 7 days
 *
 * @see CLAUDE.md - DRY principle (Don't Repeat Yourself)
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Generate access and refresh tokens for a user
   *
   * @param userId - User ID to include in token payload
   * @param email - User email to include in token payload
   * @returns Object containing accessToken and refreshToken
   */
  generateTokens(userId: string, email: string): {
    accessToken: string;
    refreshToken: string;
  } {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: AuthConstants.ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh' },
      { expiresIn: AuthConstants.REFRESH_TOKEN_EXPIRY },
    );

    return { accessToken, refreshToken };
  }
}
