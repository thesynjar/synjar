import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { EmailQueueService } from '../email/email-queue.service';
import { USER_REPOSITORY } from '@/domain/auth/repositories/user.repository.interface';
import {
  RegisterUserUseCase,
  LoginUserUseCase,
  VerifyEmailUseCase,
  ResendVerificationUseCase,
  AcceptInviteUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
} from './use-cases';
import { TokenService } from './services/token.service';
import * as bcrypt from 'bcrypt';
import { DeploymentConfig } from '@/infrastructure/config/deployment.config';

/**
 * TODO: Split this test file (967 lines) into focused suites per CLAUDE.md Clean Code rules.
 * Current file exceeds 500 line limit and covers multiple concerns:
 *
 * Plan for Phase 4 refactoring:
 * 1. auth.service.spec.ts → Keep only core setup + basic service tests (200 lines)
 * 2. auth.service.register.spec.ts → Registration flow tests (250 lines)
 * 3. auth.service.login.spec.ts → Login + grace period tests (200 lines)
 * 4. auth.service.email-verification.spec.ts → Email verification + resend tests (150 lines)
 *
 * This enables:
 * - Faster test execution (parallel runs)
 * - Easier navigation and maintenance
 * - Single responsibility per test suite
 * - Better IDE performance
 *
 * See specification 2025-12-26-review-findings.md#M5 for details.
 *
 * ---
 *
 * TODO: Migrate tests to behavior-driven approach (M3 - Technical Debt)
 *
 * Current approach: Mock verification (`toHaveBeenCalledWith`)
 * - Tests implementation (which methods were called)
 * - Brittle (breaks when refactoring internal implementation)
 *
 * Better approach: State verification with InMemoryUserRepository
 * - Tests behavior (what is the end state)
 * - Resilient to refactoring (only breaks when behavior changes)
 *
 * Infrastructure ready: See InMemoryUserRepository at:
 * - infrastructure/persistence/repositories/in-memory-user.repository.ts
 *
 * Example pattern:
 * ```typescript
 * // CURRENT (mock verification):
 * expect(userRepositoryStub.create).toHaveBeenCalledWith(expect.objectContaining({...}));
 *
 * // BETTER (state verification):
 * const user = await inMemoryRepo.findByEmail('new@test.com');
 * expect(user).toBeDefined();
 * expect(user!.isEmailVerified).toBe(false);
 * ```
 *
 * Migration plan (2-3h technical debt):
 * 1. Replace userRepositoryStub with InMemoryUserRepository instance
 * 2. Remove .toHaveBeenCalledWith() verifications
 * 3. Add state assertions (findByEmail, findById to verify end state)
 * 4. Keep tests passing throughout migration
 *
 * See specification 2025-12-26-review-findings.md#M3 for details.
 */

describe('AuthService', () => {
  let service: AuthService;
  let prismaStub: Partial<PrismaService>;
  let jwtStub: Partial<JwtService>;
  let emailServiceStub: Partial<EmailService>;
  let emailQueueServiceStub: { queueEmailVerification: jest.Mock; queueWorkspaceInvitation: jest.Mock; queuePasswordReset: jest.Mock };
  let configServiceStub: Partial<ConfigService>;
  let userRepositoryStub: { [key: string]: jest.Mock };

  beforeEach(async () => {
    // Create stubs following CLAUDE.md guidelines (stub > mock)
    prismaStub = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      } as unknown as PrismaService['user'],
      invitation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      } as unknown as PrismaService['invitation'],
      $transaction: jest.fn(),
    };

    jwtStub = {
      sign: jest.fn().mockReturnValue('test-token-123'),
      verify: jest.fn(),
    };

    emailServiceStub = {
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    };

    emailQueueServiceStub = {
      queueEmailVerification: jest.fn(),
      queueWorkspaceInvitation: jest.fn(),
      queuePasswordReset: jest.fn(),
    };

    configServiceStub = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'EMAIL_VERIFICATION_URL') {
          return 'http://localhost:5173/auth/verify';
        }
        if (key === 'FRONTEND_URL') {
          return 'http://localhost:5173';
        }
        return defaultValue;
      }),
    };

    userRepositoryStub = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByVerificationToken: jest.fn(),
      findByPasswordResetToken: jest.fn(),
      createWithWorkspace: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
      countWorkspaces: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        RegisterUserUseCase,
        LoginUserUseCase,
        VerifyEmailUseCase,
        ResendVerificationUseCase,
        AcceptInviteUseCase,
        ForgotPasswordUseCase,
        ResetPasswordUseCase,
        TokenService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: JwtService, useValue: jwtStub },
        { provide: EmailService, useValue: emailServiceStub },
        { provide: EmailQueueService, useValue: emailQueueServiceStub },
        { provide: ConfigService, useValue: configServiceStub },
        { provide: USER_REPOSITORY, useValue: userRepositoryStub },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    const ownerPermissions = [
      'workspace:create',
      'document:create',
      'document:read',
      'document:update',
      'document:delete',
      'user:invite',
      'user:remove',
    ];

    beforeEach(() => {
      // Mock cloud deployment mode for these tests
      process.env.DEPLOYMENT_MODE = 'cloud';
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
      (DeploymentConfig as any).resetCache();
    });

    afterEach(() => {
      // Reset deployment mode for other tests
      delete process.env.DEPLOYMENT_MODE;
      delete process.env.STRIPE_SECRET_KEY;
      (DeploymentConfig as any).resetCache();
    });

    it('should create user with unverified email', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
        name: 'Test User',
      };

      const createdUser = {
        id: 'user-id-123',
        email: registerDto.email,
        name: registerDto.name,
        passwordHash: 'hashed-password',
        isEmailVerified: false,
        emailVerificationToken: 'verification-token-123',
        emailVerificationSentAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.createWithWorkspace = jest.fn().mockResolvedValue(createdUser);

      // Act
      const result = await service.register(registerDto);

      // Assert - new user gets tokens (Case 3: auto-login in Cloud mode)
      expect(result).toEqual({
        message: 'Registration successful. Please check your email.',
        userId: 'user-id-123',
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(userRepositoryStub.findByEmail).toHaveBeenCalledWith(registerDto.email);
    });

    it('should create workspace for user', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.createWithWorkspace = jest.fn().mockResolvedValue({
        id: 'user-id-123',
        email: registerDto.email,
        isEmailVerified: false,
        emailVerificationToken: 'token-123',
        emailVerificationSentAt: new Date(),
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(userRepositoryStub.createWithWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: { name: registerDto.workspaceName },
        }),
      );
    });

    it('should send verification email', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.createWithWorkspace = jest.fn().mockResolvedValue({
        id: 'user-id-123',
        email: registerDto.email,
        emailVerificationToken: 'verification-token-abc',
        isEmailVerified: false,
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(emailQueueServiceStub.queueEmailVerification).toHaveBeenCalledWith(
        registerDto.email,
        'verification-token-abc',
        'http://localhost:5173/auth/verify?token=verification-token-abc',
      );
    });

    it('should generate unique verification token', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
      };

      let capturedData: { user: { emailVerificationToken: string } } | null = null;

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.createWithWorkspace = jest.fn().mockImplementation((data) => {
        capturedData = data;
        return Promise.resolve({
          id: 'user-id-123',
          email: registerDto.email,
          emailVerificationToken: data.user.emailVerificationToken,
          isEmailVerified: false,
          emailVerificationSentAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(capturedData).not.toBeNull();
      expect(capturedData!.user.emailVerificationToken).toBeDefined();
      expect(typeof capturedData!.user.emailVerificationToken).toBe('string');
      // Token should be 64 hex characters (32 bytes)
      expect(capturedData!.user.emailVerificationToken).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should set emailVerificationSentAt timestamp', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
      };

      let capturedData: { user: { emailVerificationSentAt: Date } } | null = null;
      const beforeTest = new Date();

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.createWithWorkspace = jest.fn().mockImplementation((data) => {
        capturedData = data;
        return Promise.resolve({
          id: 'user-id-123',
          email: registerDto.email,
          emailVerificationToken: data.user.emailVerificationToken,
          emailVerificationSentAt: data.user.emailVerificationSentAt,
          isEmailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(capturedData).not.toBeNull();
      expect(capturedData!.user.emailVerificationSentAt).toBeDefined();
      expect(capturedData!.user.emailVerificationSentAt instanceof Date).toBe(true);
      expect(capturedData!.user.emailVerificationSentAt.getTime()).toBeGreaterThanOrEqual(beforeTest.getTime());
    });

    it('should return generic message for existing verified user (user enumeration prevention)', async () => {
      // Arrange
      const registerDto = {
        email: 'existing@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
        name: 'Test User',
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue({
        id: 'existing-user-id',
        email: registerDto.email,
        passwordHash: 'hash',
        name: 'Existing User',
        isEmailVerified: true, // Verified user (Case 1)
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.register(registerDto);

      // Assert - returns generic message (NO tokens, prevents account takeover)
      expect(result).toEqual({
        message: 'Registration successful. Please check your email.',
        userId: 'existing-user-id',
      });
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
      expect(userRepositoryStub.createWithWorkspace).not.toHaveBeenCalled();
    });

    it('should create workspace member with OWNER role and all permissions', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
      };

      let capturedData: { ownerPermissions: string[]; workspace: { name: string }; user: { email: string; isEmailVerified: boolean } } | null = null;

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.createWithWorkspace = jest.fn().mockImplementation((data) => {
        capturedData = data;
        return Promise.resolve({
          id: 'user-id-123',
          email: registerDto.email,
          emailVerificationToken: 'token-123',
          isEmailVerified: false,
          emailVerificationSentAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(capturedData).toBeDefined();
      expect(capturedData).not.toBeNull();
      expect(capturedData!.ownerPermissions).toEqual(ownerPermissions);
      expect(capturedData!.workspace.name).toBe(registerDto.workspaceName);
      expect(capturedData!.user.email).toBe(registerDto.email);
      expect(capturedData!.user.isEmailVerified).toBe(false);
    });

    it('should reject weak password during registration', async () => {
      // Arrange
      const weakPasswords = [
        '123',                           // Too short
        'password123',                   // No uppercase, no special char
        'PASSWORD123!',                  // No lowercase
        'Password!',                     // No number
        'Password123',                   // No special char
        'aB1!',                          // Too short
      ];

      // Act & Assert
      for (const weakPassword of weakPasswords) {
        const registerDto = {
          email: 'test@example.com',
          password: weakPassword,
          workspaceName: 'My Knowledge Base',
          name: 'Test User',
        };

        await expect(service.register(registerDto)).rejects.toThrow(BadRequestException);
        await expect(service.register(registerDto)).rejects.toThrow('Password does not meet security requirements');
      }
    });

    it('should accept strong password that meets all requirements', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MySecurePass123!',
        workspaceName: 'My Knowledge Base',
        name: 'Test User',
      };

      const createdUser = {
        id: 'user-id-123',
        email: registerDto.email,
        name: registerDto.name,
        passwordHash: 'hashed-password',
        isEmailVerified: false,
        emailVerificationToken: 'verification-token-123',
        emailVerificationSentAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.createWithWorkspace = jest.fn().mockResolvedValue(createdUser);

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result.userId).toBe(createdUser.id);
      expect(result.message).toBe('Registration successful. Please check your email.');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('login', () => {
    it('should return token for valid credentials', async () => {
      // Arrange
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue({
        id: 'user-id-123',
        email: loginDto.email,
        name: 'Test User',
        passwordHash: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result.accessToken).toBe('test-token-123');
      expect(result.user.email).toBe(loginDto.email);
      expect(result.user.id).toBe('user-id-123');
      expect(jwtStub.sign).toHaveBeenCalledWith(
        { sub: 'user-id-123', email: loginDto.email },
        { expiresIn: '15m' },
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      // Arrange
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue({
        id: 'user-id-123',
        email: loginDto.email,
        name: 'Test User',
        passwordHash: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(jwtStub.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      // Arrange
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(jwtStub.sign).not.toHaveBeenCalled();
    });

    it('should handle user without name', async () => {
      // Arrange
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue({
        id: 'user-id-123',
        email: loginDto.email,
        name: null,
        passwordHash: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result.user.name).toBeNull();
      expect(result.user.email).toBe(loginDto.email);
    });
  });

  describe('validateUser', () => {
    it('should return user data for valid userId', async () => {
      // Arrange
      const userId = 'user-id-123';
      userRepositoryStub.findById = jest.fn().mockResolvedValue({
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.validateUser(userId);

      // Assert
      expect(result).toEqual({
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
      });
      expect(userRepositoryStub.findById).toHaveBeenCalledWith(userId);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      // Arrange
      const userId = 'non-existent-user-id';
      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.validateUser(userId)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateUser(userId)).rejects.toThrow(
        'User not found',
      );
    });

    it('should not include passwordHash in response', async () => {
      // Arrange
      const userId = 'user-id-123';
      userRepositoryStub.findById = jest.fn().mockResolvedValue({
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'sensitive-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.validateUser(userId);

      // Assert
      expect(result).not.toHaveProperty('passwordHash');
      expect(Object.keys(result)).toEqual(['id', 'email', 'name']);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      // Arrange
      const token = 'a'.repeat(64); // Valid 64-character hex token
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        emailVerificationSentAt: new Date(), // Token was just sent
        isEmailVerified: false,
      };

      userRepositoryStub.findByVerificationToken = jest.fn().mockResolvedValue(user);
      userRepositoryStub.update = jest.fn().mockResolvedValue({
        ...user,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
      });

      // Act
      const result = await service.verifyEmail(token);

      // Assert
      expect(result).toEqual({ message: 'Email verified successfully' });
      expect(userRepositoryStub.findByVerificationToken).toHaveBeenCalledWith(token);
    });

    it('should throw NotFoundException for invalid token', async () => {
      // Arrange
      const token = 'invalid-token';
      userRepositoryStub.findByVerificationToken = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.verifyEmail(token)).rejects.toThrow(NotFoundException);
      await expect(service.verifyEmail(token)).rejects.toThrow('Invalid verification token');
    });

    it('should throw BadRequestException for expired token', async () => {
      // Arrange
      const token = 'b'.repeat(64); // Valid 64-character hex token
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        emailVerificationSentAt: twentyFiveHoursAgo,
        isEmailVerified: false,
      };

      userRepositoryStub.findByVerificationToken = jest.fn().mockResolvedValue(user);

      // Act & Assert
      await expect(service.verifyEmail(token)).rejects.toThrow(BadRequestException);
      await expect(service.verifyEmail(token)).rejects.toThrow('Verification token has expired');
    });

    it('should keep verification token after verification (for idempotency)', async () => {
      // Arrange
      const token = 'c'.repeat(64); // Valid 64-character hex token
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        emailVerificationSentAt: new Date(),
        isEmailVerified: false,
      };

      userRepositoryStub.findByVerificationToken = jest.fn().mockResolvedValue(user);
      userRepositoryStub.update = jest.fn().mockResolvedValue({
        ...user,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
      });

      // Act
      await service.verifyEmail(token);

      // Assert - Token is kept to enable idempotent retries (React Strict Mode, etc.)
      expect(userRepositoryStub.update).toHaveBeenCalledWith(user.id, {
        isEmailVerified: true,
        emailVerifiedAt: expect.any(Date),
        // emailVerificationToken NOT cleared - will expire after 24h TTL
      });
    });

    it('should be idempotent - allow re-verification of already verified email', async () => {
      // Arrange - Simulates React Strict Mode double-request or accidental retry
      const token = 'e'.repeat(64);
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        emailVerificationSentAt: new Date(),
        isEmailVerified: true, // Already verified!
      };

      userRepositoryStub.findByVerificationToken = jest.fn().mockResolvedValue(user);
      userRepositoryStub.update = jest.fn();

      // Act
      const result = await service.verifyEmail(token);

      // Assert
      expect(result).toEqual({ message: 'Email verified successfully' });
      expect(userRepositoryStub.update).not.toHaveBeenCalled(); // No update needed
    });

    it('should set emailVerifiedAt timestamp', async () => {
      // Arrange
      const token = 'd'.repeat(64); // Valid 64-character hex token
      const beforeTest = new Date();
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        emailVerificationSentAt: new Date(),
        isEmailVerified: false,
      };

      let capturedUpdateData: { emailVerifiedAt: Date; emailVerificationToken: null } | null = null;
      userRepositoryStub.findByVerificationToken = jest.fn().mockResolvedValue(user);
      userRepositoryStub.update = jest.fn().mockImplementation((_id, data) => {
        capturedUpdateData = data;
        return Promise.resolve({
          ...user,
          isEmailVerified: true,
          emailVerifiedAt: data.emailVerifiedAt,
          emailVerificationToken: null,
        });
      });

      // Act
      await service.verifyEmail(token);

      // Assert
      expect(capturedUpdateData).not.toBeNull();
      expect(capturedUpdateData!.emailVerifiedAt).toBeDefined();
      expect(capturedUpdateData!.emailVerifiedAt instanceof Date).toBe(true);
      expect(capturedUpdateData!.emailVerifiedAt.getTime()).toBeGreaterThanOrEqual(
        beforeTest.getTime(),
      );
    });
  });

  describe('resendVerification', () => {
    it('should resend verification email', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = {
        id: 'user-id-123',
        email,
        isEmailVerified: false,
        emailVerificationSentAt: new Date(Date.now() - 120 * 1000), // 2 minutes ago
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(user);
      userRepositoryStub.update = jest.fn().mockResolvedValue({
        ...user,
        emailVerificationToken: 'new-token',
        emailVerificationSentAt: new Date(),
      });

      // Act
      const result = await service.resendVerification(email);

      // Assert
      expect(result).toEqual({ message: 'Verification email sent' });
      expect(emailQueueServiceStub.queueEmailVerification).toHaveBeenCalled();
    });

    it('should return generic message for non-existent email (security)', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);

      // Act
      const result = await service.resendVerification(email);

      // Assert - generic message to prevent email enumeration
      expect(result).toEqual({
        message: 'If the email exists, a verification email will be sent',
      });
      expect(emailQueueServiceStub.queueEmailVerification).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if email already verified', async () => {
      // Arrange
      const email = 'verified@example.com';
      const user = {
        id: 'user-id-123',
        email,
        isEmailVerified: true,
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(user);

      // Act & Assert
      await expect(service.resendVerification(email)).rejects.toThrow(BadRequestException);
      await expect(service.resendVerification(email)).rejects.toThrow('Email is already verified');
    });

    it('should throw HttpException 429 if cooldown not elapsed', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = {
        id: 'user-id-123',
        email,
        isEmailVerified: false,
        emailVerificationSentAt: new Date(Date.now() - 30 * 1000), // 30 seconds ago (within 60s cooldown)
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(user);

      // Act & Assert
      await expect(service.resendVerification(email)).rejects.toThrow(HttpException);
      try {
        await service.resendVerification(email);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('should not resend verification within 60s cooldown', async () => {
      // Arrange - existing unverified user, email sent 45 seconds ago (within cooldown)
      const email = 'unverified@example.com';
      const user = {
        id: 'user-id-123',
        email,
        isEmailVerified: false,
        emailVerificationSentAt: new Date(Date.now() - 45 * 1000), // 45 seconds ago (< 60s)
        emailVerificationToken: 'a'.repeat(64), // Valid 64-character hex token
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(user);

      // Act & Assert
      await expect(service.resendVerification(email)).rejects.toThrow(HttpException);
      try {
        await service.resendVerification(email);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        // Verify that no update was attempted
        expect(userRepositoryStub.update).not.toHaveBeenCalled();
        expect(emailQueueServiceStub.queueEmailVerification).not.toHaveBeenCalled();
      }
    });

    it('should generate new token on resend', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = {
        id: 'user-id-123',
        email,
        isEmailVerified: false,
        emailVerificationToken: 'e'.repeat(64), // Valid 64-character hex token
        emailVerificationSentAt: new Date(Date.now() - 120 * 1000), // 2 minutes ago
        createdAt: new Date(),
      };

      let capturedUpdateData: { emailVerificationToken: string; emailVerificationSentAt: Date } | null = null;
      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(user);
      userRepositoryStub.update = jest.fn().mockImplementation((_id, data) => {
        capturedUpdateData = data;
        return Promise.resolve({
          ...user,
          emailVerificationToken: data.emailVerificationToken,
          emailVerificationSentAt: data.emailVerificationSentAt,
        });
      });

      // Act
      await service.resendVerification(email);

      // Assert
      expect(capturedUpdateData).not.toBeNull();
      expect(capturedUpdateData!.emailVerificationToken).toBeDefined();
      expect(capturedUpdateData!.emailVerificationToken).not.toBe('old-token');
      // Token should be 64 hex characters (32 bytes)
      expect(capturedUpdateData!.emailVerificationToken).toMatch(/^[a-f0-9]{64}$/);
      expect(capturedUpdateData!.emailVerificationSentAt).toBeDefined();
      expect(capturedUpdateData!.emailVerificationSentAt instanceof Date).toBe(true);
    });
  });

  // Phase 3: Cloud Mode Registration Tests (TDD)
  describe('register - Cloud Mode (Dual-Mode Registration)', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      workspaceName: 'Test Workspace',
      name: 'Test User',
    };

    beforeEach(() => {
      // Mock cloud deployment mode
      process.env.DEPLOYMENT_MODE = 'cloud';
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
      (DeploymentConfig as any).resetCache();
    });

    afterEach(() => {
      // Reset deployment mode for other tests
      delete process.env.DEPLOYMENT_MODE;
      delete process.env.STRIPE_SECRET_KEY;
      (DeploymentConfig as any).resetCache();
    });

    it('should NOT return tokens for existing verified user (prevent account takeover)', async () => {
      // Arrange - user already exists and is verified
      const existingUser = {
        id: 'existing-user-id',
        email: registerDto.email,
        isEmailVerified: true,
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(existingUser);

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toEqual({
        message: 'Registration successful. Please check your email.',
        userId: existingUser.id,
      });
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
      expect(emailQueueServiceStub.queueEmailVerification).not.toHaveBeenCalled();
    });

    it('should resend verification email for existing unverified user (NO tokens)', async () => {
      // Arrange - user exists but not verified, last email sent >60s ago
      const existingUser = {
        id: 'existing-user-id',
        email: registerDto.email,
        isEmailVerified: false,
        emailVerificationToken: 'f'.repeat(64), // Valid 64-character hex token
        emailVerificationSentAt: new Date(Date.now() - 120000), // 2 min ago (>60s cooldown)
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(existingUser);
      userRepositoryStub.update = jest.fn().mockResolvedValue({
        ...existingUser,
        emailVerificationToken: 'new-token',
        emailVerificationSentAt: new Date(),
      });

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toEqual({
        message: 'Registration successful. Please check your email.',
        userId: existingUser.id,
      });
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
      expect(userRepositoryStub.update).toHaveBeenCalled();
      expect(emailQueueServiceStub.queueEmailVerification).toHaveBeenCalledWith(
        existingUser.email,
        expect.any(String),
        expect.any(String),
      );
    });

    it('should return tokens for NEW user (auto-login in Cloud mode)', async () => {
      // Arrange - user does not exist
      const createdUser = {
        id: 'new-user-id',
        email: registerDto.email,
        name: registerDto.name,
        passwordHash: 'hashed-password',
        isEmailVerified: false,
        emailVerificationToken: 'verification-token-123',
        emailVerificationSentAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.createWithWorkspace = jest.fn().mockResolvedValue(createdUser);

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toEqual({
        message: 'Registration successful. Please check your email.',
        userId: createdUser.id,
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(emailQueueServiceStub.queueEmailVerification).toHaveBeenCalled();
    });
  });

  // Phase 4: Self-Hosted Mode Tests (TDD)
  describe('register - Self-Hosted Mode (Dual-Mode Registration)', () => {
    const registerDto = {
      email: 'admin@example.com',
      password: 'MyP@ssw0rd123!',
      workspaceName: 'My Company',
      name: 'Admin User',
    };

    beforeEach(() => {
      // Mock self-hosted deployment mode
      process.env.DEPLOYMENT_MODE = 'self-hosted';
      delete process.env.STRIPE_SECRET_KEY;
      process.env.ADMIN_EMAIL = 'admin@company.com';
      (DeploymentConfig as any).resetCache();
    });

    it('should create VERIFIED admin user for first registration (workspace count = 0)', async () => {
      // Arrange - first user in self-hosted instance
      const createdUser = {
        id: 'admin-user-id',
        email: registerDto.email,
        name: registerDto.name,
        passwordHash: 'hashed-password',
        isEmailVerified: true, // VERIFIED immediately in self-hosted!
        emailVerificationToken: null,
        emailVerificationSentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.countWorkspaces = jest.fn().mockResolvedValue(0); // No workspaces yet
      userRepositoryStub.createWithWorkspace = jest.fn().mockResolvedValue(createdUser);

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toEqual({
        message: 'Registration successful. You can log in now.',
        userId: createdUser.id,
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(userRepositoryStub.createWithWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            email: registerDto.email,
            isEmailVerified: true, // Verified immediately!
            emailVerificationToken: null,
          }),
        }),
      );
      // No verification email sent for self-hosted first user
      expect(emailQueueServiceStub.queueEmailVerification).not.toHaveBeenCalled();
    });

    it('should reject second user registration with 403 Forbidden (workspace count > 0)', async () => {
      // Arrange - second user trying to register in self-hosted
      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.countWorkspaces = jest.fn().mockResolvedValue(1); // Workspace exists

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(
        expect.objectContaining({
          status: 403,
          message: 'Public registration is disabled on this instance.',
        }),
      );

      // Verify no user was created
      expect(userRepositoryStub.createWithWorkspace).not.toHaveBeenCalled();
      expect(emailQueueServiceStub.queueEmailVerification).not.toHaveBeenCalled();
    });

    it('should include adminContact in 403 error when ADMIN_EMAIL is set', async () => {
      // Arrange - ADMIN_EMAIL env var is set
      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.countWorkspaces = jest.fn().mockResolvedValue(1);

      // Mock configService to return ADMIN_EMAIL
      configServiceStub.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'ADMIN_EMAIL') return 'admin@company.com';
        if (key === 'EMAIL_VERIFICATION_URL') return 'http://localhost:5173/auth/verify';
        if (key === 'FRONTEND_URL') return 'http://localhost:5173';
        return undefined;
      });

      // Act & Assert
      try {
        await service.register(registerDto);
        fail('Should have thrown ForbiddenException');
      } catch (error: any) {
        expect(error.status).toBe(403);
        expect(error.response).toMatchObject({
          errorCode: 'REGISTRATION_DISABLED',
          message: 'Public registration is disabled on this instance.',
          hint: 'Please contact the administrator to request access.',
          adminContact: 'ad***@co***.com', // Obfuscated from admin@company.com
        });
      }
    });

    it('should obfuscate admin email in 403 response to prevent phishing (M5)', async () => {
      // Arrange - Test email obfuscation with different email formats
      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
      userRepositoryStub.countWorkspaces = jest.fn().mockResolvedValue(1);

      // Mock configService to return ADMIN_EMAIL
      configServiceStub.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'ADMIN_EMAIL') return 'admin@example.com';
        if (key === 'EMAIL_VERIFICATION_URL') return 'http://localhost:5173/auth/verify';
        if (key === 'FRONTEND_URL') return 'http://localhost:5173';
        return undefined;
      });

      // Act & Assert
      try {
        await service.register(registerDto);
        fail('Should have thrown ForbiddenException');
      } catch (error: any) {
        expect(error.status).toBe(403);
        // Verify email is obfuscated: admin@example.com → ad***@ex***.com
        expect(error.response.adminContact).toBe('ad***@ex***.com');
        // Verify full email is NOT exposed
        expect(error.response.adminContact).not.toBe('admin@example.com');
      }
    });

    it('should have constant response time regardless of user existence (prevent timing attacks)', async () => {
      // Arrange - Cloud mode
      process.env.DEPLOYMENT_MODE = 'cloud';
      (DeploymentConfig as any).resetCache();

      const times: number[] = [];
      const iterations = 10;

      // Act - Test registration for mix of new and existing users
      for (let i = 0; i < iterations; i++) {
        // Alternate between existing and new users
        if (i % 2 === 0) {
          // Existing verified user (no email sent)
          userRepositoryStub.findByEmail = jest.fn().mockResolvedValue({
            id: 'existing-user',
            email: 'existing@test.com',
            isEmailVerified: true,
          });
        } else {
          // New user (email queued in background)
          userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(null);
          userRepositoryStub.createWithWorkspace = jest.fn().mockResolvedValue({
            id: 'new-user',
            email: 'new@test.com',
            passwordHash: 'hash',
            name: 'Test User',
            isEmailVerified: false,
            emailVerificationToken: 'token-123',
            emailVerificationSentAt: new Date(),
          });
        }

        const start = Date.now();
        await service.register({
          email: i % 2 === 0 ? 'existing@test.com' : 'new@test.com',
          password: 'ValidPass123!',
          workspaceName: 'Test Workspace',
          name: 'Test User',
        });
        times.push(Date.now() - start);
      }

      // Assert - All response times should be within 50ms of each other
      const min = Math.min(...times);
      const max = Math.max(...times);
      const variance = max - min;

      expect(variance).toBeLessThan(50);

      // Also verify minimum response time was enforced (150ms as per implementation)
      expect(min).toBeGreaterThanOrEqual(145); // Allow 5ms tolerance
    });

    afterEach(() => {
      // Reset deployment mode and env vars for other tests
      delete process.env.DEPLOYMENT_MODE;
      delete process.env.ADMIN_EMAIL;
      (DeploymentConfig as any).resetCache();
    });
  });

  // Phase 3: Login Grace Period Tests (TDD)
  describe('login - Grace Period (15 minutes)', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'SecurePass123!',
    };

    it('should allow login for unverified user WITHIN 15-min grace period', async () => {
      // Arrange - user created 10 minutes ago (< 15 min)
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      const user = {
        id: 'user-id',
        email: loginDto.email,
        name: 'Test User',
        passwordHash: hashedPassword,
        isEmailVerified: false,
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
        updatedAt: new Date(),
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(user);

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(loginDto.email);
    });

    it('should REJECT login for unverified user AFTER 15-min grace period', async () => {
      // Arrange - user created 20 minutes ago (> 15 min)
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      const user = {
        id: 'user-id',
        email: loginDto.email,
        name: 'Test User',
        passwordHash: hashedPassword,
        isEmailVerified: false,
        createdAt: new Date(Date.now() - 20 * 60 * 1000), // 20 min ago (>15)
        updatedAt: new Date(),
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(user);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        'Please verify your email before logging in',
      );
    });

    it('should REJECT at exactly 15 minutes (boundary test)', async () => {
      // Arrange - user created exactly 15 minutes ago
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      const user = {
        id: 'user-id',
        email: loginDto.email,
        name: 'Test User',
        passwordHash: hashedPassword,
        isEmailVerified: false,
        createdAt: new Date(Date.now() - 15 * 60 * 1000), // Exactly 15 min
        updatedAt: new Date(),
      };

      userRepositoryStub.findByEmail = jest.fn().mockResolvedValue(user);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        'Please verify your email before logging in',
      );
    });
  });

  // Phase 5: Invitation System Tests (TDD)
  describe('acceptInvite - Invitation System', () => {
    const acceptInviteDto = {
      token: 'invitation-token-123',
      password: 'ValidPass123!',
      name: 'Invited User',
    };

    it('should reject expired invitation token and update status to EXPIRED', async () => {
      // Arrange - invitation expired 1 second ago
      const expiredInvitation = {
        id: 'inv-123',
        token: acceptInviteDto.token,
        email: 'invited@test.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        workspaceId: 'ws-123',
        role: 'MEMBER',
        createdById: 'creator-id',
        createdAt: new Date(),
      };

      (prismaStub.invitation!.findUnique as jest.Mock).mockResolvedValue(expiredInvitation);
      (prismaStub.invitation!.update as jest.Mock).mockResolvedValue({
        ...expiredInvitation,
        status: 'EXPIRED',
      });

      // Act & Assert
      await expect(service.acceptInvite(acceptInviteDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.acceptInvite(acceptInviteDto)).rejects.toThrow(
        'This invitation has expired',
      );

      // Verify invitation status updated to EXPIRED
      expect(prismaStub.invitation!.update).toHaveBeenCalledWith({
        where: { id: 'inv-123' },
        data: { status: 'EXPIRED' },
      });
    });

    it('should reject already-used invitation', async () => {
      // Arrange - invitation already accepted
      const usedInvitation = {
        id: 'inv-456',
        token: acceptInviteDto.token,
        email: 'invited@test.com',
        status: 'ACCEPTED', // Already used
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Valid expiry
        workspaceId: 'ws-123',
        role: 'MEMBER',
        createdById: 'creator-id',
        createdAt: new Date(),
        acceptedAt: new Date(Date.now() - 60000), // Accepted 1 min ago
      };

      (prismaStub.invitation!.findUnique as jest.Mock).mockResolvedValue(usedInvitation);

      // Act & Assert
      await expect(service.acceptInvite(acceptInviteDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.acceptInvite(acceptInviteDto)).rejects.toThrow(
        'Invitation already used or revoked',
      );
    });

    it('should create user, add to workspace, mark invitation as ACCEPTED, and return tokens', async () => {
      // Arrange - valid invitation
      const validInvitation = {
        id: 'inv-789',
        token: acceptInviteDto.token,
        email: 'invited@test.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Valid for 7 days
        workspaceId: 'ws-123',
        role: 'MEMBER',
        createdById: 'creator-id',
        createdAt: new Date(),
        workspace: {
          id: 'ws-123',
          name: 'Test Workspace',
        },
      };

      const createdUser = {
        id: 'new-user-id',
        email: validInvitation.email,
        name: acceptInviteDto.name,
        passwordHash: 'hashed-password',
        isEmailVerified: true, // Skip verification for invited users
        emailVerificationToken: null,
        emailVerificationSentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prismaStub.invitation!.findUnique as jest.Mock).mockResolvedValue(validInvitation);

      // Mock transaction
      (prismaStub.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const txStub = {
          user: {
            create: jest.fn().mockResolvedValue(createdUser),
          },
          workspaceMember: {
            create: jest.fn().mockResolvedValue({
              id: 'member-id',
              userId: createdUser.id,
              workspaceId: validInvitation.workspaceId,
              role: validInvitation.role,
              createdAt: new Date(),
            }),
          },
          invitation: {
            update: jest.fn().mockResolvedValue({
              ...validInvitation,
              status: 'ACCEPTED',
              acceptedAt: new Date(),
            }),
          },
        };
        return callback(txStub);
      });

      // Act
      const result = await service.acceptInvite(acceptInviteDto);

      // Assert - user created with isEmailVerified=true
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toEqual({
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
      });

      // Verify transaction executed
      expect(prismaStub.$transaction).toHaveBeenCalled();
    });
  });
});
