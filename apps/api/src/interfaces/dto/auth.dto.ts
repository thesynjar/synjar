import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: any }) => value?.trim().toLowerCase())
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'MyP@ssw0rd!', minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
  })
  password!: string;

  @ApiProperty({ example: 'My Knowledge Base' })
  @IsString()
  @MinLength(2, { message: 'Workspace name must be at least 2 characters' })
  workspaceName!: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: any }) => value?.trim().toLowerCase())
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  password!: string;
}

export class UserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  name!: string | null;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ description: 'Token expiry time in seconds' })
  expiresIn!: number;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  refreshToken!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Email verification token' })
  @IsString()
  token!: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: any }) => value?.trim().toLowerCase())
  @IsEmail()
  email!: string;
}

export class MessageResponseDto {
  @ApiProperty()
  message!: string;
}

export class RegisterResponseDto {
  @ApiProperty()
  message!: string;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional({
    description: 'JWT access token (returned for cloud mode and self-hosted first user)',
  })
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'JWT refresh token (returned for cloud mode and self-hosted first user)',
  })
  refreshToken?: string;
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invitation token' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'MyP@ssw0rd!', minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
  })
  password!: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name!: string;
}
