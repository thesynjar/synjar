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
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaStub: Partial<PrismaService>;
  let jwtStub: Partial<JwtService>;
  let emailServiceStub: Partial<EmailService>;
  let configServiceStub: Partial<ConfigService>;

  beforeEach(async () => {
    // Create stubs following CLAUDE.md guidelines (stub > mock)
    prismaStub = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      } as unknown as PrismaService['user'],
      $transaction: jest.fn(),
    };

    jwtStub = {
      sign: jest.fn().mockReturnValue('test-token-123'),
    };

    emailServiceStub = {
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    };

    configServiceStub = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'EMAIL_VERIFICATION_URL') {
          return 'http://localhost:5173/auth/verify';
        }
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: JwtService, useValue: jwtStub },
        { provide: EmailService, useValue: emailServiceStub },
        { provide: ConfigService, useValue: configServiceStub },
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

      const createdWorkspace = {
        id: 'workspace-id-123',
        name: registerDto.workspaceName,
        createdById: createdUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdMember = {
        id: 'member-id-123',
        workspaceId: createdWorkspace.id,
        userId: createdUser.id,
        role: 'OWNER',
        permissions: ownerPermissions,
        createdAt: new Date(),
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      (prismaStub.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue(createdUser),
          },
          workspace: {
            create: jest.fn().mockResolvedValue(createdWorkspace),
          },
          workspaceMember: {
            create: jest.fn().mockResolvedValue(createdMember),
          },
        };
        return callback(tx);
      });

      // Act
      const result = await service.register(registerDto);

      // Assert - new user gets tokens (Case 3: auto-login in Cloud mode)
      expect(result).toEqual({
        message: 'Registration successful. Please check your email.',
        userId: 'user-id-123',
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(prismaStub.user!.findUnique).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
    });

    it('should create workspace for user', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
      };

      let capturedWorkspaceData: any = null;

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      (prismaStub.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue({
              id: 'user-id-123',
              email: registerDto.email,
              isEmailVerified: false,
              emailVerificationToken: 'token-123',
              emailVerificationSentAt: new Date(),
            }),
          },
          workspace: {
            create: jest.fn().mockImplementation((data) => {
              capturedWorkspaceData = data;
              return Promise.resolve({
                id: 'workspace-id-123',
                ...data.data,
              });
            }),
          },
          workspaceMember: {
            create: jest.fn().mockResolvedValue({
              id: 'member-id-123',
              role: 'OWNER',
            }),
          },
        };
        return callback(tx);
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(capturedWorkspaceData).toBeDefined();
      expect(capturedWorkspaceData.data.name).toBe(registerDto.workspaceName);
      expect(capturedWorkspaceData.data.createdById).toBe('user-id-123');
    });

    it('should send verification email', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      (prismaStub.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue({
              id: 'user-id-123',
              email: registerDto.email,
              emailVerificationToken: 'verification-token-abc',
              isEmailVerified: false,
            }),
          },
          workspace: {
            create: jest.fn().mockResolvedValue({ id: 'workspace-id-123' }),
          },
          workspaceMember: {
            create: jest.fn().mockResolvedValue({ id: 'member-id-123' }),
          },
        };
        return callback(tx);
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(emailServiceStub.sendEmailVerification).toHaveBeenCalledWith(
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

      let capturedUserData: any = null;

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      (prismaStub.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: {
            create: jest.fn().mockImplementation((data) => {
              capturedUserData = data;
              return Promise.resolve({
                id: 'user-id-123',
                email: registerDto.email,
                emailVerificationToken: data.data.emailVerificationToken,
                isEmailVerified: false,
              });
            }),
          },
          workspace: {
            create: jest.fn().mockResolvedValue({ id: 'workspace-id-123' }),
          },
          workspaceMember: {
            create: jest.fn().mockResolvedValue({ id: 'member-id-123' }),
          },
        };
        return callback(tx);
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(capturedUserData.data.emailVerificationToken).toBeDefined();
      expect(typeof capturedUserData.data.emailVerificationToken).toBe('string');
      // Token should be 64 hex characters (32 bytes)
      expect(capturedUserData.data.emailVerificationToken).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should set emailVerificationSentAt timestamp', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
      };

      let capturedUserData: any = null;
      const beforeTest = new Date();

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      (prismaStub.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: {
            create: jest.fn().mockImplementation((data) => {
              capturedUserData = data;
              return Promise.resolve({
                id: 'user-id-123',
                email: registerDto.email,
                emailVerificationToken: data.data.emailVerificationToken,
                isEmailVerified: false,
              });
            }),
          },
          workspace: {
            create: jest.fn().mockResolvedValue({ id: 'workspace-id-123' }),
          },
          workspaceMember: {
            create: jest.fn().mockResolvedValue({ id: 'member-id-123' }),
          },
        };
        return callback(tx);
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(capturedUserData.data.emailVerificationSentAt).toBeDefined();
      expect(capturedUserData.data.emailVerificationSentAt instanceof Date).toBe(true);
      expect(capturedUserData.data.emailVerificationSentAt.getTime()).toBeGreaterThanOrEqual(beforeTest.getTime());
    });

    it('should return generic message for existing verified user (user enumeration prevention)', async () => {
      // Arrange
      const registerDto = {
        email: 'existing@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
        name: 'Test User',
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue({
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
      expect(prismaStub.$transaction).not.toHaveBeenCalled();
    });

    it('should create workspace member with OWNER role and all permissions', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'MyP@ssw0rd123!',
        workspaceName: 'My Knowledge Base',
      };

      let capturedMemberData: any = null;

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      (prismaStub.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue({
              id: 'user-id-123',
              email: registerDto.email,
              emailVerificationToken: 'token-123',
              isEmailVerified: false,
            }),
          },
          workspace: {
            create: jest.fn().mockResolvedValue({
              id: 'workspace-id-123',
              name: registerDto.workspaceName,
            }),
          },
          workspaceMember: {
            create: jest.fn().mockImplementation((data) => {
              capturedMemberData = data;
              return Promise.resolve({
                id: 'member-id-123',
                ...data.data,
              });
            }),
          },
        };
        return callback(tx);
      });

      // Act
      await service.register(registerDto);

      // Assert
      expect(capturedMemberData).toBeDefined();
      expect(capturedMemberData.data.role).toBe('OWNER');
      expect(capturedMemberData.data.permissions).toEqual(ownerPermissions);
      expect(capturedMemberData.data.userId).toBe('user-id-123');
      expect(capturedMemberData.data.workspaceId).toBe('workspace-id-123');
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
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue({
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
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue({
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

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);

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
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue({
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
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue({
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
      expect(prismaStub.user!.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      // Arrange
      const userId = 'non-existent-user-id';
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);

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
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue({
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
      const token = 'valid-token-123';
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        emailVerificationSentAt: new Date(), // Token was just sent
        isEmailVerified: false,
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);
      prismaStub.user!.update = jest.fn().mockResolvedValue({
        ...user,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
      });

      // Act
      const result = await service.verifyEmail(token);

      // Assert
      expect(result).toEqual({ message: 'Email verified successfully' });
      expect(prismaStub.user!.findUnique).toHaveBeenCalledWith({
        where: { emailVerificationToken: token },
      });
    });

    it('should throw NotFoundException for invalid token', async () => {
      // Arrange
      const token = 'invalid-token';
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.verifyEmail(token)).rejects.toThrow(NotFoundException);
      await expect(service.verifyEmail(token)).rejects.toThrow('Invalid verification token');
    });

    it('should throw BadRequestException for expired token', async () => {
      // Arrange
      const token = 'expired-token';
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        emailVerificationSentAt: twentyFiveHoursAgo,
        isEmailVerified: false,
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);

      // Act & Assert
      await expect(service.verifyEmail(token)).rejects.toThrow(BadRequestException);
      await expect(service.verifyEmail(token)).rejects.toThrow('Verification token has expired');
    });

    it('should clear verification token after verification', async () => {
      // Arrange
      const token = 'valid-token-123';
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        emailVerificationSentAt: new Date(),
        isEmailVerified: false,
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);
      prismaStub.user!.update = jest.fn().mockResolvedValue({
        ...user,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
      });

      // Act
      await service.verifyEmail(token);

      // Assert
      expect(prismaStub.user!.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          emailVerifiedAt: expect.any(Date),
          emailVerificationToken: null,
        },
      });
    });

    it('should set emailVerifiedAt timestamp', async () => {
      // Arrange
      const token = 'valid-token-123';
      const beforeTest = new Date();
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        emailVerificationSentAt: new Date(),
        isEmailVerified: false,
      };

      let capturedUpdateData: any = null;
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);
      prismaStub.user!.update = jest.fn().mockImplementation((args) => {
        capturedUpdateData = args;
        return Promise.resolve({
          ...user,
          isEmailVerified: true,
          emailVerifiedAt: args.data.emailVerifiedAt,
          emailVerificationToken: null,
        });
      });

      // Act
      await service.verifyEmail(token);

      // Assert
      expect(capturedUpdateData.data.emailVerifiedAt).toBeDefined();
      expect(capturedUpdateData.data.emailVerifiedAt instanceof Date).toBe(true);
      expect(capturedUpdateData.data.emailVerifiedAt.getTime()).toBeGreaterThanOrEqual(
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

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);
      prismaStub.user!.update = jest.fn().mockResolvedValue({
        ...user,
        emailVerificationToken: 'new-token',
        emailVerificationSentAt: new Date(),
      });

      // Act
      const result = await service.resendVerification(email);

      // Assert
      expect(result).toEqual({ message: 'Verification email sent' });
      expect(emailServiceStub.sendEmailVerification).toHaveBeenCalled();
    });

    it('should return generic message for non-existent email (security)', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);

      // Act
      const result = await service.resendVerification(email);

      // Assert - generic message to prevent email enumeration
      expect(result).toEqual({
        message: 'If the email exists, a verification email will be sent',
      });
      expect(emailServiceStub.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if email already verified', async () => {
      // Arrange
      const email = 'verified@example.com';
      const user = {
        id: 'user-id-123',
        email,
        isEmailVerified: true,
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);

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

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);

      // Act & Assert
      await expect(service.resendVerification(email)).rejects.toThrow(HttpException);
      try {
        await service.resendVerification(email);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('should generate new token on resend', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = {
        id: 'user-id-123',
        email,
        isEmailVerified: false,
        emailVerificationToken: 'old-token',
        emailVerificationSentAt: new Date(Date.now() - 120 * 1000), // 2 minutes ago
      };

      let capturedUpdateData: any = null;
      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);
      prismaStub.user!.update = jest.fn().mockImplementation((args) => {
        capturedUpdateData = args;
        return Promise.resolve({
          ...user,
          emailVerificationToken: args.data.emailVerificationToken,
          emailVerificationSentAt: args.data.emailVerificationSentAt,
        });
      });

      // Act
      await service.resendVerification(email);

      // Assert
      expect(capturedUpdateData.data.emailVerificationToken).toBeDefined();
      expect(capturedUpdateData.data.emailVerificationToken).not.toBe('old-token');
      // Token should be 64 hex characters (32 bytes)
      expect(capturedUpdateData.data.emailVerificationToken).toMatch(/^[a-f0-9]{64}$/);
      expect(capturedUpdateData.data.emailVerificationSentAt).toBeDefined();
      expect(capturedUpdateData.data.emailVerificationSentAt instanceof Date).toBe(true);
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

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(existingUser);

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toEqual({
        message: 'Registration successful. Please check your email.',
        userId: existingUser.id,
      });
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
      expect(emailServiceStub.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('should resend verification email for existing unverified user (NO tokens)', async () => {
      // Arrange - user exists but not verified, last email sent >60s ago
      const existingUser = {
        id: 'existing-user-id',
        email: registerDto.email,
        isEmailVerified: false,
        emailVerificationToken: 'old-token',
        emailVerificationSentAt: new Date(Date.now() - 120000), // 2 min ago (>60s cooldown)
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(existingUser);
      prismaStub.user!.update = jest.fn().mockResolvedValue({
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
      expect(prismaStub.user!.update).toHaveBeenCalled();
      expect(emailServiceStub.sendEmailVerification).toHaveBeenCalledWith(
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

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      (prismaStub.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          workspace: {
            create: jest.fn().mockResolvedValue({
              id: 'workspace-id',
              name: registerDto.workspaceName,
              createdById: createdUser.id,
            }),
          },
          workspaceMember: {
            create: jest.fn().mockResolvedValue({
              id: 'member-id',
              workspaceId: 'workspace-id',
              userId: createdUser.id,
              role: 'OWNER',
            }),
          },
        };
        return callback(tx);
      });

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toEqual({
        message: 'Registration successful. Please check your email.',
        userId: createdUser.id,
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(emailServiceStub.sendEmailVerification).toHaveBeenCalled();
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

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);

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

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);

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

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(user);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        'Please verify your email before logging in',
      );
    });
  });
});
