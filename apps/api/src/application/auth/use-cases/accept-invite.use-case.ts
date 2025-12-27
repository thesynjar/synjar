import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { PasswordValidator } from '@/domain/auth/validators/password.validator';
import { TokenService } from '../services/token.service';
import { InvitationStatus, Role } from '@prisma/client';
import { WeakPasswordException, InvitationExpiredException } from '../exceptions';
import type { AuthResult } from '../auth.service';

export interface AcceptInviteDto {
  token: string;
  password: string;
  name: string;
}

@Injectable()
export class AcceptInviteUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: AcceptInviteDto): Promise<AuthResult> {
    // 1. Validate password
    const passwordValidation = PasswordValidator.validate(dto.password);
    if (!passwordValidation.valid) {
      throw new WeakPasswordException(passwordValidation.errors);
    }

    // 2. Find invitation by token
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: dto.token },
      include: { workspace: true },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid invitation token');
    }

    // 3. Check invitation status
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Invitation already used or revoked');
    }

    // 4. Check expiry
    if (invitation.expiresAt < new Date()) {
      // Mark as expired
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new InvitationExpiredException();
    }

    // 5. Create user + workspace member + update invitation (transaction)
    const user = await this.prisma.$transaction(async (tx) => {
      // Create user with verified email
      const newUser = await tx.user.create({
        data: {
          email: invitation.email,
          passwordHash: await bcrypt.hash(dto.password, 10),
          name: dto.name,
          isEmailVerified: true, // Skip verification for invited users
          emailVerificationToken: null,
          emailVerificationSentAt: null,
        },
      });

      // Add user to workspace
      await tx.workspaceMember.create({
        data: {
          userId: newUser.id,
          workspaceId: invitation.workspaceId,
          role: invitation.role,
          permissions: this.getPermissionsForRole(invitation.role),
        },
      });

      // Mark invitation as accepted
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      return newUser;
    });

    // 6. Generate tokens (auto-login)
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

  private getPermissionsForRole(role: Role): string[] {
    switch (role) {
      case Role.OWNER:
        return [
          'workspace:create',
          'document:create',
          'document:read',
          'document:update',
          'document:delete',
          'user:invite',
          'user:remove',
        ];
      case Role.ADMIN:
        return [
          'document:create',
          'document:read',
          'document:update',
          'document:delete',
          'user:invite',
        ];
      case Role.MEMBER:
        return ['document:create', 'document:read'];
      default:
        return [];
    }
  }
}
