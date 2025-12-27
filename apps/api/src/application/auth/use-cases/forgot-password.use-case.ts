import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '@/domain/auth/repositories/user.repository.interface';
import { EmailQueueService } from '@/application/email/email-queue.service';
import { UserAggregate } from '@/domain/auth/user.aggregate';
import { AuthConstants } from '@/infrastructure/config/constants';

/**
 * ForgotPasswordUseCase
 *
 * Handles password reset requests with security measures:
 * - Anti-enumeration: Always returns 200 OK (prevents user discovery)
 * - Timing attack prevention: Minimum 150ms response time
 * - Cooldown: 60 seconds between requests for the same email
 * - Non-blocking email: Uses queue to prevent timing attacks
 *
 * @see docs/specifications/2025-12-27-password-reset.md
 */
@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly emailQueueService: EmailQueueService,
    private readonly configService: ConfigService,
  ) {}

  async execute(email: string): Promise<{ message: string }> {
    const startTime = Date.now();

    try {
      const user = await this.userRepository.findByEmail(email);

      // Prevent email enumeration - return generic message for non-existent users
      if (!user) {
        await this.ensureMinimumResponseTime(startTime);
        return { message: 'Password reset instructions sent. Please check your email inbox and spam folder.' };
      }

      // Use aggregate to enforce business rules
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

      const canReset = userAggregate.canRequestPasswordReset();

      if (!canReset.can) {
        // Within cooldown - throw rate limit error
        throw new HttpException(
          'Please wait before requesting another password reset',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Generate new token via aggregate
      const newToken = userAggregate.requestPasswordReset();

      // Update user with new token
      await this.userRepository.update(user.id, {
        passwordResetToken: newToken.getValue(),
        passwordResetSentAt: new Date(),
      });

      // Queue password reset email in background (non-blocking) - prevents timing attacks
      const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
      const resetUrl = `${frontendUrl}/reset-password?token=${newToken.getValue()}`;

      this.emailQueueService.queuePasswordReset(email, newToken.getValue(), resetUrl);

      await this.ensureMinimumResponseTime(startTime);
      return { message: 'Password reset instructions sent. Please check your email inbox and spam folder.' };
    } catch (error) {
      await this.ensureMinimumResponseTime(startTime);
      throw error;
    }
  }

  /**
   * Ensures minimum response time to prevent timing attacks
   * This prevents attackers from detecting if an email exists
   * based on response time differences
   */
  private async ensureMinimumResponseTime(startTime: number): Promise<void> {
    const elapsed = Date.now() - startTime;
    const remaining = AuthConstants.MIN_RESPONSE_TIME_MS - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}
