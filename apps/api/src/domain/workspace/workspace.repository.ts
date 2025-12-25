import { Workspace, WorkspaceMember, User, Role } from '@prisma/client';

export interface WorkspaceWithMembers extends Workspace {
  members: (WorkspaceMember & { user: User })[];
}

export interface CreateWorkspaceData {
  name: string;
  ownerId: string;
}

export interface IWorkspaceRepository {
  findById(id: string): Promise<WorkspaceWithMembers | null>;
  findByUserId(userId: string): Promise<WorkspaceWithMembers[]>;
  create(data: CreateWorkspaceData): Promise<WorkspaceWithMembers>;
  update(id: string, data: { name: string }): Promise<WorkspaceWithMembers>;
  delete(id: string): Promise<void>;

  // Members
  findMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  addMember(workspaceId: string, userId: string, role: Role): Promise<WorkspaceMember>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
  getMembers(workspaceId: string): Promise<(WorkspaceMember & { user: User })[]>;
}

export const WORKSPACE_REPOSITORY = Symbol('IWorkspaceRepository');
