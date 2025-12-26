import { Injectable, Inject } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '@/domain/auth/repositories/user.repository.interface';
import { EmailQueueService } from '@/application/email/email-queue.service';
import { ConfigService } from '@nestjs/config';
import { PasswordValidator } from '@/domain/auth/validators/password.validator';
import { UserAggregate } from '@/domain/auth/user.aggregate';
import { DeploymentConfig } from '@/infrastructure/config/deployment.config';
import { AuthConstants } from '@/infrastructure/config/constants';
import { TokenService } from '../services/token.service';
import { RegistrationDisabledException, WeakPasswordException } from '../exceptions';
import type { RegisterDto, RegisterResult } from '../auth.service';

const OWNER_PERMISSIONS = [
  'workspace:create',
  'document:create',
  'document:read',
  'document:update',
  'document:delete',
  'user:invite',
  'user:remove',
];

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly emailQueueService: EmailQueueService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: RegisterDto): Promise<RegisterResult> {
    const startTime = Date.now();
    const ensureConstantTime = (result: RegisterResult): Promise<RegisterResult> => {
      return this.ensureConstantResponseTime(startTime, result);
    };

    const existing = await this.userRepository.findByEmail(dto.email);

    // Route to appropriate handler based on user state
    if (existing?.isEmailVerified) {
      return ensureConstantTime(this.handleExistingVerifiedUser(existing));
    }

    if (existing && !existing.isEmailVerified) {
      return ensureConstantTime(await this.handleExistingUnverifiedUser(existing));
    }

    return ensureConstantTime(await this.handleNewUserRegistration(dto));
  }

  private handleExistingVerifiedUser(existing: any): RegisterResult {
    // Case 1: User exists and is verified → NO tokens (prevent account takeover)
    return {
      message: 'Registration successful. Please check your email.',
      userId: existing.id,
    };
  }

  private async handleExistingUnverifiedUser(existing: any): Promise<RegisterResult> {
    // Case 2: User exists but NOT verified → resend email, NO tokens
    const userAggregate = UserAggregate.reconstitute(existing);
    const canResend = userAggregate.canResendVerification();

    if (!canResend.can) {
      // Within cooldown - return generic message (no email sent)
      return {
        message: 'Registration successful. Please check your email.',
        userId: existing.id,
      };
    }

    // Generate new token via aggregate and resend
    const newToken = userAggregate.resendVerification();
    await this.userRepository.update(existing.id, {
      emailVerificationToken: newToken.getValue(),
      emailVerificationSentAt: new Date(),
    });

    const baseUrl = this.configService.get(
      'EMAIL_VERIFICATION_URL',
      'http://localhost:5173/auth/verify',
    );
    const verificationUrl = `${baseUrl}?token=${newToken.getValue()}`;

    // Queue email in background (non-blocking) - prevents timing attacks
    this.emailQueueService.queueEmailVerification(
      existing.email,
      newToken.getValue(),
      verificationUrl,
    );

    return {
      message: 'Registration successful. Please check your email.',
      userId: existing.id,
    };
  }

  private async handleNewUserRegistration(dto: RegisterDto): Promise<RegisterResult> {
    // Password validation (required for both modes)
    const passwordValidation = PasswordValidator.validate(dto.password);
    if (!passwordValidation.valid) {
      throw new WeakPasswordException(passwordValidation.errors);
    }

    // Check deployment mode
    if (DeploymentConfig.isSelfHosted()) {
      return this.handleSelfHostedRegistration(dto);
    } else {
      return this.handleCloudRegistration(dto);
    }
  }

  private async handleSelfHostedRegistration(dto: RegisterDto): Promise<RegisterResult> {
    // Case 4 & 5: Self-hosted mode
    const workspaceCount = await this.userRepository.countWorkspaces();

    if (workspaceCount > 0) {
      // Case 5: Second+ user → 403 Forbidden
      const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
      const adminContact = adminEmail
        ? this.obfuscateEmail(adminEmail)
        : undefined;

      throw new RegistrationDisabledException(adminContact);
    }

    // Case 4: First user → instant admin (verified, auto-login)
    const passwordHash = await bcrypt.hash(dto.password, AuthConstants.BCRYPT_COST_FACTOR);

    const user = await this.userRepository.createWithWorkspace({
      user: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        isEmailVerified: true, // VERIFIED immediately in self-hosted!
        emailVerificationToken: null,
        emailVerificationSentAt: null,
      },
      workspace: {
        name: dto.workspaceName,
      },
      ownerPermissions: OWNER_PERMISSIONS,
    });

    // Generate tokens for auto-login
    const tokens = this.tokenService.generateTokens(user.id, user.email);

    return {
      message: 'Registration successful. You can log in now.',
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private async handleCloudRegistration(dto: RegisterDto): Promise<RegisterResult> {
    // Case 3: Cloud mode → NEW user with email verification
    const passwordHash = await bcrypt.hash(dto.password, AuthConstants.BCRYPT_COST_FACTOR);
    const emailVerificationToken = this.generateVerificationToken();
    const emailVerificationSentAt = new Date();

    const user = await this.userRepository.createWithWorkspace({
      user: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        isEmailVerified: false,
        emailVerificationToken,
        emailVerificationSentAt,
      },
      workspace: {
        name: dto.workspaceName,
      },
      ownerPermissions: OWNER_PERMISSIONS,
    });

    // Queue verification email in background (non-blocking) - prevents timing attacks
    const baseUrl = this.configService.get(
      'EMAIL_VERIFICATION_URL',
      'http://localhost:5173/auth/verify',
    );
    const verificationUrl = `${baseUrl}?token=${user.emailVerificationToken}`;
    this.emailQueueService.queueEmailVerification(
      user.email,
      user.emailVerificationToken!,
      verificationUrl,
    );

    // Generate tokens for auto-login (Case 3 only!)
    const tokens = this.tokenService.generateTokens(user.id, user.email);

    return {
      message: 'Registration successful. Please check your email.',
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private async ensureConstantResponseTime(
    startTime: number,
    result: RegisterResult,
  ): Promise<RegisterResult> {
    const elapsed = Date.now() - startTime;
    if (elapsed < AuthConstants.MIN_RESPONSE_TIME_MS) {
      await new Promise(resolve => setTimeout(resolve, AuthConstants.MIN_RESPONSE_TIME_MS - elapsed));
    }
    return result;
  }

  private generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private obfuscateEmail(email: string): string {
    const [local, domain] = email.split('@');
    const localObfuscated = local.slice(0, 2) + '***';
    const domainParts = domain.split('.');
    const domainObfuscated = domainParts[0].slice(0, 2) + '***.' + domainParts.slice(1).join('.');
    return `${localObfuscated}@${domainObfuscated}`;
  }
}
