import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '@/domain/auth/repositories/user.repository.interface';
import { UserAggregate } from '@/domain/auth/user.aggregate';
import { AuthConstants } from '@/infrastructure/config/constants';
import { PasswordValidator } from '@/domain/auth/validators/password.validator';
import { WeakPasswordException } from '../exceptions';

/**
 * ResetPasswordUseCase
 *
 * Handles password reset with token validation:
 * - Token TTL: 1 hour
 * - Password validation: 12+ chars, uppercase, lowercase, number, special char
 * - Token invalidation: Token cleared after successful reset
 *
 * @see docs/specifications/2025-12-27-password-reset.md
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.userRepository.findByPasswordResetToken(token);

    if (!user) {
      throw new NotFoundException('This password reset link is invalid or has expired. Please request a new password reset.');
    }

    if (!user.passwordResetSentAt) {
      throw new BadRequestException('Password reset token is invalid');
    }

    // Check token TTL (1 hour)
    const tokenAge = Date.now() - user.passwordResetSentAt.getTime();
    const isExpired = tokenAge > AuthConstants.PASSWORD_RESET_TOKEN_TTL_MS;

    if (isExpired) {
      throw new BadRequestException('This password reset link has expired. Reset links are valid for 1 hour. Please request a new one.');
    }

    // Validate new password strength
    const passwordValidation = PasswordValidator.validate(newPassword);
    if (!passwordValidation.valid) {
      throw new WeakPasswordException(passwordValidation.errors);
    }

    // Hash the new password
    const newPasswordHash = await bcrypt.hash(
      newPassword,
      AuthConstants.BCRYPT_COST_FACTOR,
    );

    // Use aggregate to emit domain event
    const userAggregate = UserAggregate.reconstitute({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      isEmailVerified: user.isEmailVerified,
      emailVerificationToken: user.emailVerificationToken,
      emailVerificationSentAt: user.emailVerificationSentAt,
      createdAt: user.createdAt,
      passwordResetToken: user.passwordResetToken,
      passwordResetSentAt: user.passwordResetSentAt,
    });

    userAggregate.resetPassword();

    // Update user: new password hash, clear reset token
    await this.userRepository.update(user.id, {
      passwordHash: newPasswordHash,
      passwordResetToken: null,
      passwordResetSentAt: null,
    });

    return { message: 'Password has been reset successfully' };
  }
}
