import { Injectable, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '@/domain/auth/repositories/user.repository.interface';
import { EmailService } from '@/application/email/email.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PasswordValidator } from '@/domain/auth/validators/password.validator';
import { UserAggregate } from '@/domain/auth/user.aggregate';
import { DeploymentConfig } from '@/infrastructure/config/deployment.config';
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
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
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
    await this.emailService.sendEmailVerification(
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
      throw new BadRequestException({
        message: 'Password does not meet security requirements',
        errors: passwordValidation.errors,
      });
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

      throw new ForbiddenException({
        error: 'REGISTRATION_DISABLED',
        message: 'Public registration is disabled on this instance.',
        hint: 'Please contact the administrator to request access.',
        ...(adminEmail && { adminContact: adminEmail }),
      });
    }

    // Case 4: First user → instant admin (verified, auto-login)
    const passwordHash = await bcrypt.hash(dto.password, 10);

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
    const tokens = this.generateTokens(user.id, user.email);

    return {
      message: 'Registration successful. You can log in now.',
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private async handleCloudRegistration(dto: RegisterDto): Promise<RegisterResult> {
    // Case 3: Cloud mode → NEW user with email verification
    const passwordHash = await bcrypt.hash(dto.password, 10);
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

    // Send verification email (after transaction commits)
    const baseUrl = this.configService.get(
      'EMAIL_VERIFICATION_URL',
      'http://localhost:5173/auth/verify',
    );
    const verificationUrl = `${baseUrl}?token=${user.emailVerificationToken}`;
    await this.emailService.sendEmailVerification(
      user.email,
      user.emailVerificationToken!,
      verificationUrl,
    );

    // Generate tokens for auto-login (Case 3 only!)
    const tokens = this.generateTokens(user.id, user.email);

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
    const MIN_RESPONSE_TIME_MS = 150;
    if (elapsed < MIN_RESPONSE_TIME_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_RESPONSE_TIME_MS - elapsed));
    }
    return result;
  }

  private generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateTokens(userId: string, email: string): { accessToken: string; refreshToken: string } {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh' },
      { expiresIn: '7d' },
    );

    return { accessToken, refreshToken };
  }
}
