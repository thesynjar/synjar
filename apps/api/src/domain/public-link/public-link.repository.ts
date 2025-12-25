import { PublicLink } from '@prisma/client';

export interface CreatePublicLinkData {
  workspaceId: string;
  token: string;
  name?: string;
  allowedTags?: string[];
  expiresAt?: Date;
}

export interface PublicLinkWithWorkspace extends PublicLink {
  workspace: {
    id: string;
    name: string;
    createdById: string;
  };
}

export interface IPublicLinkRepository {
  // Legacy methods (without RLS) - for backward compatibility
  findById(id: string): Promise<PublicLink | null>;
  findByToken(token: string): Promise<PublicLink | null>;
  findByWorkspace(workspaceId: string): Promise<PublicLink[]>;
  findByIdAndWorkspace(id: string, workspaceId: string): Promise<PublicLink | null>;
  create(data: CreatePublicLinkData): Promise<PublicLink>;
  update(id: string, data: Partial<CreatePublicLinkData & { isActive: boolean }>): Promise<PublicLink>;
  delete(id: string): Promise<void>;

  // RLS-aware methods
  createWithUser(userId: string, data: CreatePublicLinkData): Promise<PublicLink>;
  findAllWithUser(userId: string, workspaceId: string): Promise<PublicLink[]>;
  findOneWithUser(userId: string, id: string, workspaceId: string): Promise<PublicLink | null>;
  deleteWithUser(userId: string, id: string): Promise<void>;

  // System operations (bypass RLS)
  findByTokenWithWorkspace(token: string): Promise<PublicLinkWithWorkspace | null>;
}

export const PUBLIC_LINK_REPOSITORY = Symbol('IPublicLinkRepository');
