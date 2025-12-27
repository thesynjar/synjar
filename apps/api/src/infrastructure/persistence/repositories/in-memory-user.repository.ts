/**
 * InMemoryUserRepository - Test Double
 *
 * In-memory implementation of IUserRepository for testing purposes.
 * Provides behavior-driven testing without database dependencies.
 *
 * Usage: Use in unit/integration tests instead of mocking PrismaService.
 * Benefits: Tests behavior (state changes) instead of implementation (method calls).
 *
 * @see docs/specifications/2025-12-26-review-findings.md Section M3
 * @see CLAUDE.md/ddd-architecture.md - "NEVER mock aggregates, mock only external APIs"
 */

import {
  IUserRepository,
  CreateUserData,
  UpdateUserData,
  CreateUserWithWorkspaceData,
} from '../../../domain/auth/repositories/user.repository.interface';

interface InMemoryUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationSentAt: Date | null;
  emailVerifiedAt: Date | null;
  passwordResetToken: string | null;
  passwordResetSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InMemoryWorkspace {
  id: string;
  name: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

interface InMemoryWorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, InMemoryUser> = new Map();
  private workspaces: Map<string, InMemoryWorkspace> = new Map();
  private workspaceMembers: Map<string, InMemoryWorkspaceMember> = new Map();

  async findByEmail(email: string): Promise<InMemoryUser | null> {
    const found = Array.from(this.users.values()).find((u) => u.email === email);
    return found || null;
  }

  async findById(id: string): Promise<InMemoryUser | null> {
    return this.users.get(id) || null;
  }

  async findByVerificationToken(token: string): Promise<InMemoryUser | null> {
    const found = Array.from(this.users.values()).find(
      (u) => u.emailVerificationToken === token,
    );
    return found || null;
  }

  async findByPasswordResetToken(token: string): Promise<InMemoryUser | null> {
    const found = Array.from(this.users.values()).find(
      (u) => u.passwordResetToken === token,
    );
    return found || null;
  }

  async create(data: CreateUserData): Promise<InMemoryUser> {
    const user: InMemoryUser = {
      id: this.generateId(),
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name ?? null,
      isEmailVerified: data.isEmailVerified,
      emailVerificationToken: data.emailVerificationToken,
      emailVerificationSentAt: data.emailVerificationSentAt,
      emailVerifiedAt: null,
      passwordResetToken: null,
      passwordResetSentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async update(userId: string, data: UpdateUserData): Promise<InMemoryUser> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    const updated: InMemoryUser = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };
    this.users.set(userId, updated);
    return updated;
  }

  async createWithWorkspace(
    data: CreateUserWithWorkspaceData,
  ): Promise<InMemoryUser> {
    // Create user
    const user: InMemoryUser = {
      id: this.generateId(),
      email: data.user.email,
      passwordHash: data.user.passwordHash,
      name: data.user.name ?? null,
      isEmailVerified: data.user.isEmailVerified,
      emailVerificationToken: data.user.emailVerificationToken,
      emailVerificationSentAt: data.user.emailVerificationSentAt,
      emailVerifiedAt: null,
      passwordResetToken: null,
      passwordResetSentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, user);

    // Create workspace
    const workspace: InMemoryWorkspace = {
      id: this.generateId(),
      name: data.workspace.name,
      createdById: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.workspaces.set(workspace.id, workspace);

    // Create workspace member
    const member: InMemoryWorkspaceMember = {
      id: this.generateId(),
      workspaceId: workspace.id,
      userId: user.id,
      role: 'OWNER',
      permissions: data.ownerPermissions,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.workspaceMembers.set(member.id, member);

    return user;
  }

  // Test helpers
  async clear(): Promise<void> {
    this.users.clear();
    this.workspaces.clear();
    this.workspaceMembers.clear();
  }

  async getAll(): Promise<InMemoryUser[]> {
    return Array.from(this.users.values());
  }

  async getWorkspacesByUserId(userId: string): Promise<InMemoryWorkspace[]> {
    const memberWorkspaceIds = Array.from(this.workspaceMembers.values())
      .filter((m) => m.userId === userId)
      .map((m) => m.workspaceId);

    return Array.from(this.workspaces.values()).filter((w) =>
      memberWorkspaceIds.includes(w.id),
    );
  }

  async countWorkspaces(): Promise<number> {
    return this.workspaces.size;
  }

  private idCounter = 1;
  private generateId(): string {
    return `test-id-${this.idCounter++}`;
  }
}
