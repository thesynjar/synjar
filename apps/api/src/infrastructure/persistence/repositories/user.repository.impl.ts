import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IUserRepository,
  CreateUserData,
  UpdateUserData,
  CreateUserWithWorkspaceData,
} from '../../../domain/auth/repositories/user.repository.interface';

/**
 * Prisma implementation of IUserRepository
 *
 * Infrastructure layer adapter that implements the domain repository interface
 * using Prisma ORM for PostgreSQL persistence.
 *
 * Note: Auth operations bypass RLS (Row Level Security) as they occur
 * before user authentication. Uses direct Prisma client.
 *
 * @see DDD Pattern: Repository Implementation (Infrastructure Layer)
 * @see SOLID: Dependency Inversion Principle (concrete implementation)
 */
@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });
  }

  async create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        isEmailVerified: data.isEmailVerified,
        emailVerificationToken: data.emailVerificationToken,
        emailVerificationSentAt: data.emailVerificationSentAt,
      },
    });
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async createWithWorkspace(data: CreateUserWithWorkspaceData): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: data.user.email,
          passwordHash: data.user.passwordHash,
          name: data.user.name,
          isEmailVerified: data.user.isEmailVerified,
          emailVerificationToken: data.user.emailVerificationToken,
          emailVerificationSentAt: data.user.emailVerificationSentAt,
        },
      });

      // Create workspace
      const workspace = await tx.workspace.create({
        data: {
          name: data.workspace.name,
          createdById: user.id,
        },
      });

      // Create workspace member with OWNER role
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'OWNER',
          permissions: data.ownerPermissions,
        },
      });

      return user;
    });
  }
}
