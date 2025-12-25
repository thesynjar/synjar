import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaStub: Partial<PrismaService>;
  let jwtStub: Partial<JwtService>;

  beforeEach(async () => {
    // Create stubs following CLAUDE.md guidelines (stub > mock)
    prismaStub = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      } as unknown as PrismaService['user'],
    };

    jwtStub = {
      sign: jest.fn().mockReturnValue('test-token-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: JwtService, useValue: jwtStub },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create a new user with hashed password', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      prismaStub.user!.create = jest.fn().mockResolvedValue({
        id: 'user-id-123',
        email: registerDto.email,
        name: registerDto.name,
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.register(registerDto);

      // Assert - test behavior, not implementation
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe(registerDto.email);
      expect(result.user.name).toBe(registerDto.name);
      expect(result.user.id).toBe('user-id-123');
      expect(prismaStub.user!.findUnique).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
      expect(prismaStub.user!.create).toHaveBeenCalled();
      expect(jwtStub.sign).toHaveBeenCalledWith(
        { sub: 'user-id-123', email: registerDto.email },
        { expiresIn: '15m' },
      );
    });

    it('should hash the password before storing', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      const createSpy = jest.fn().mockResolvedValue({
        id: 'user-id-123',
        email: registerDto.email,
        name: registerDto.name,
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaStub.user!.create = createSpy;

      // Act
      await service.register(registerDto);

      // Assert - verify password was hashed
      expect(createSpy).toHaveBeenCalled();
      const createCall = createSpy.mock.calls[0][0];
      expect(createCall.data.passwordHash).toBeDefined();
      expect(createCall.data.passwordHash).not.toBe(registerDto.password);
      // Verify it's a valid bcrypt hash
      const isValidHash = await bcrypt.compare(
        registerDto.password,
        createCall.data.passwordHash,
      );
      expect(isValidHash).toBe(true);
    });

    it('should throw ConflictException if email already exists', async () => {
      // Arrange
      const registerDto = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Test User',
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue({
        id: 'existing-user-id',
        email: registerDto.email,
        passwordHash: 'hash',
        name: 'Existing User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'Email already registered',
      );
      expect(prismaStub.user!.create).not.toHaveBeenCalled();
    });

    it('should create user without name if not provided', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);
      prismaStub.user!.create = jest.fn().mockResolvedValue({
        id: 'user-id-123',
        email: registerDto.email,
        name: null,
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result.user.name).toBeNull();
      expect(result.user.email).toBe(registerDto.email);
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
});
