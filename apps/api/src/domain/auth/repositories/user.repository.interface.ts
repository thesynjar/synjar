import { User, Workspace, WorkspaceMember } from '@prisma/client';

/**
 * User Repository Interface
 *
 * Domain-level abstraction for user persistence operations.
 * Implements the Repository pattern to decouple domain logic from infrastructure.
 *
 * @see DDD Pattern: Repository
 * @see SOLID: Dependency Inversion Principle (DIP)
 */

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name?: string;
  isEmailVerified: boolean;
  emailVerificationToken: string;
  emailVerificationSentAt: Date;
}

export interface UpdateUserData {
  passwordHash?: string;
  name?: string;
  isEmailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationSentAt?: Date | null;
  emailVerifiedAt?: Date | null;
}

export interface CreateUserWithWorkspaceData {
  user: CreateUserData;
  workspace: {
    name: string;
  };
  ownerPermissions: string[];
}

export interface UserWithWorkspace extends User {
  workspaces?: (WorkspaceMember & { workspace: Workspace })[];
}

export interface IUserRepository {
  /**
   * Find user by email address
   * Used for registration check and login
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Find user by ID
   * Used for JWT validation and user lookup
   */
  findById(id: string): Promise<User | null>;

  /**
   * Find user by email verification token
   * Used for email verification flow
   */
  findByVerificationToken(token: string): Promise<User | null>;

  /**
   * Create a new user
   * Simple user creation without workspace
   */
  create(data: CreateUserData): Promise<User>;

  /**
   * Update user data
   * Used for email verification, password reset, profile updates
   */
  update(id: string, data: UpdateUserData): Promise<User>;

  /**
   * Create user with workspace in a transaction
   * Used during registration to ensure atomic creation
   */
  createWithWorkspace(data: CreateUserWithWorkspaceData): Promise<User>;
}

/**
 * DI Token for IUserRepository
 * Use with @Inject() decorator for dependency injection
 *
 * @example
 * constructor(
 *   @Inject(USER_REPOSITORY) private userRepository: IUserRepository
 * ) {}
 */
export const USER_REPOSITORY = Symbol('IUserRepository');
