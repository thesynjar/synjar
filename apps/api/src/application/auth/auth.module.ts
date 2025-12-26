import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from '../../interfaces/http/auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../../infrastructure/persistence/prisma/prisma.module';
import { USER_REPOSITORY } from '../../domain/auth/repositories/user.repository.interface';
import { PrismaUserRepository } from '../../infrastructure/persistence/repositories/user.repository.impl';
import {
  RegisterUserUseCase,
  LoginUserUseCase,
  VerifyEmailUseCase,
  ResendVerificationUseCase,
} from './use-cases';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
    EmailModule,
    PrismaModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RegisterUserUseCase,
    LoginUserUseCase,
    VerifyEmailUseCase,
    ResendVerificationUseCase,
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
