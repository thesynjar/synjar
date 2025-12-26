import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '@/domain/auth/repositories/user.repository.interface';
import { UserAggregate } from '@/domain/auth/user.aggregate';

const TOKEN_TTL_HOURS = 24;

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(token: string): Promise<{ message: string }> {
    const user = await this.userRepository.findByVerificationToken(token);

    if (!user) {
      throw new NotFoundException('Invalid verification token');
    }

    // Idempotency: If email already verified, return success
    // This handles React Strict Mode double-requests and accidental retries
    if (user.isEmailVerified) {
      return { message: 'Email verified successfully' };
    }

    if (!user.emailVerificationSentAt) {
      throw new BadRequestException('Verification token is invalid');
    }

    const tokenAge = Date.now() - user.emailVerificationSentAt.getTime();
    const isExpired = tokenAge > TOKEN_TTL_HOURS * 60 * 60 * 1000;

    if (isExpired) {
      throw new BadRequestException('Verification token has expired');
    }

    // Use aggregate to verify email
    const userAggregate = UserAggregate.reconstitute(user);
    userAggregate.verifyEmail();

    await this.userRepository.update(user.id, {
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      // Keep token until TTL expires - enables idempotent retries
      // Token will be unusable after 24h anyway due to TTL check above
    });

    return { message: 'Email verified successfully' };
  }
}
