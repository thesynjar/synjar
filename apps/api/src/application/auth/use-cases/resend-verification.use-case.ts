import { Injectable, BadRequestException, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '@/domain/auth/repositories/user.repository.interface';
import { EmailService } from '@/application/email/email.service';
import { UserAggregate } from '@/domain/auth/user.aggregate';

@Injectable()
export class ResendVerificationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async execute(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findByEmail(email);

    // Prevent email enumeration - return generic message for non-existent users
    if (!user) {
      return { message: 'If the email exists, a verification email will be sent' };
    }

    // Use aggregate to enforce business rules
    const userAggregate = UserAggregate.reconstitute(user);
    const canResend = userAggregate.canResendVerification();

    if (!canResend.can) {
      if (canResend.reason === 'Email already verified') {
        throw new BadRequestException('Email is already verified');
      }
      // Within cooldown
      throw new HttpException(
        'Please wait before requesting another verification email',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate new token via aggregate
    const newToken = userAggregate.resendVerification();

    // Update user with new token
    await this.userRepository.update(user.id, {
      emailVerificationToken: newToken.getValue(),
      emailVerificationSentAt: new Date(),
    });

    // Send verification email
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
    const verificationUrl = `${frontendUrl}/verify-email?token=${newToken.getValue()}`;

    await this.emailService.sendEmailVerification(email, newToken.getValue(), verificationUrl);

    return { message: 'Verification email sent' };
  }
}
