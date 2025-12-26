import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { EmailService } from '@/application/email/email.service';

interface RegisterDto {
  email: string;
  password: string;
  workspaceName: string;
  name?: string;
}

interface RegisterResult {
  message: string;
  userId: string;
  accessToken?: string;
  refreshToken?: string;
}

const OWNER_PERMISSIONS = [
  'workspace:create',
  'document:create',
  'document:read',
  'document:update',
  'document:delete',
  'user:invite',
  'user:remove',
];

interface LoginDto {
  email: string;
  password: string;
}

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

const TOKEN_TTL_HOURS = 24;
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Case 1: User exists and is verified → NO tokens (prevent account takeover)
    if (existing && existing.isEmailVerified) {
      return {
        message: 'Registration successful. Please check your email.',
        userId: existing.id,
      };
    }

    // Case 2: User exists but NOT verified → resend email, NO tokens
    if (existing && !existing.isEmailVerified) {
      // Check cooldown (60s between resends)
      const RESEND_COOLDOWN_MS = 60 * 1000;
      if (existing.emailVerificationSentAt) {
        const timeSinceSent = Date.now() - existing.emailVerificationSentAt.getTime();
        if (timeSinceSent < RESEND_COOLDOWN_MS) {
          // Within cooldown - return generic message (no email sent)
          return {
            message: 'Registration successful. Please check your email.',
            userId: existing.id,
          };
        }
      }

      // Generate new token and resend
      const newToken = this.generateVerificationToken();
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          emailVerificationToken: newToken,
          emailVerificationSentAt: new Date(),
        },
      });

      const baseUrl = this.configService.get(
        'EMAIL_VERIFICATION_URL',
        'http://localhost:5173/auth/verify',
      );
      const verificationUrl = `${baseUrl}?token=${newToken}`;
      await this.emailService.sendEmailVerification(
        existing.email,
        newToken,
        verificationUrl,
      );

      return {
        message: 'Registration successful. Please check your email.',
        userId: existing.id,
      };
    }

    // Case 3: NEW user → create + auto-login WITH tokens (Cloud mode)
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const emailVerificationToken = this.generateVerificationToken();
    const emailVerificationSentAt = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      // Create user with unverified email
      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name,
          isEmailVerified: false,
          emailVerificationToken,
          emailVerificationSentAt,
        },
      });

      // Create workspace
      const workspace = await tx.workspace.create({
        data: {
          name: dto.workspaceName,
          createdById: createdUser.id,
        },
      });

      // Create workspace member with OWNER role
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: createdUser.id,
          role: 'OWNER',
          permissions: OWNER_PERMISSIONS,
        },
      });

      return createdUser;
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

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Grace period check (15 minutes for unverified users)
    if (!user.isEmailVerified) {
      const GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 minutes
      const accountAge = Date.now() - user.createdAt.getTime();

      if (accountAge >= GRACE_PERIOD_MS) {
        throw new UnauthorizedException(
          'Please verify your email before logging in',
        );
      }
      // Within grace period - allow login
    }

    const tokens = this.generateTokens(user.id, user.email);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async validateUser(userId: string): Promise<{ id: string; email: string; name: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const tokens = this.generateTokens(user.id, user.email);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new NotFoundException('Invalid verification token');
    }

    if (!user.emailVerificationSentAt) {
      throw new BadRequestException('Verification token is invalid');
    }

    const tokenAge = Date.now() - user.emailVerificationSentAt.getTime();
    const isExpired = tokenAge > TOKEN_TTL_HOURS * 60 * 60 * 1000;

    if (isExpired) {
      throw new BadRequestException('Verification token has expired');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
      },
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Prevent email enumeration - return generic message for non-existent users
    if (!user) {
      return { message: 'If the email exists, a verification email will be sent' };
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Check cooldown
    if (user.emailVerificationSentAt) {
      const timeSinceSent = Date.now() - user.emailVerificationSentAt.getTime();
      const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;

      if (timeSinceSent < cooldownMs) {
        throw new HttpException(
          'Please wait before requesting another verification email',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Generate new token
    const newToken = this.generateVerificationToken();

    // Update user with new token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: newToken,
        emailVerificationSentAt: new Date(),
      },
    });

    // Send verification email
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
    const verificationUrl = `${frontendUrl}/verify-email?token=${newToken}`;

    await this.emailService.sendEmailVerification(email, newToken, verificationUrl);

    return { message: 'Verification email sent' };
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
