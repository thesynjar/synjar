import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '@/domain/auth/repositories/user.repository.interface';
import { UserAggregate } from '@/domain/auth/user.aggregate';
import { TokenService } from '../services/token.service';
import { EmailNotVerifiedException } from '../exceptions';
import type { LoginDto, AuthResult } from '../auth.service';

@Injectable()
export class LoginUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: LoginDto): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Use aggregate to enforce business rules (grace period check)
    const userAggregate = UserAggregate.reconstitute(user);
    if (!userAggregate.canLoginWithoutVerification()) {
      throw new EmailNotVerifiedException();
    }

    const tokens = this.tokenService.generateTokens(user.id, user.email);

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
  }
}
