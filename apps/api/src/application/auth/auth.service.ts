import {
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '@/domain/auth/repositories/user.repository.interface';
import {
  RegisterUserUseCase,
  LoginUserUseCase,
  VerifyEmailUseCase,
  ResendVerificationUseCase,
  AcceptInviteUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
} from './use-cases';

export interface RegisterDto {
  email: string;
  password: string;
  workspaceName: string;
  name?: string;
}

export interface RegisterResult {
  message: string;
  userId: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface AcceptInviteDto {
  token: string;
  password: string;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly loginUserUseCase: LoginUserUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resendVerificationUseCase: ResendVerificationUseCase,
    private readonly acceptInviteUseCase: AcceptInviteUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    return this.registerUserUseCase.execute(dto);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    return this.loginUserUseCase.execute(dto);
  }

  async validateUser(userId: string): Promise<{ id: string; email: string; name: string | null }> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthResult> {
    try {
      const payload = this.jwtService.verify(refreshToken);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.userRepository.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const tokens = this.generateTokens(user.id, user.email);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900, // 15 minutes in seconds
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    return this.verifyEmailUseCase.execute(token);
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    return this.resendVerificationUseCase.execute(email);
  }

  async acceptInvite(dto: AcceptInviteDto): Promise<AuthResult> {
    return this.acceptInviteUseCase.execute(dto);
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    return this.forgotPasswordUseCase.execute(email);
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    return this.resetPasswordUseCase.execute(token, password);
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
