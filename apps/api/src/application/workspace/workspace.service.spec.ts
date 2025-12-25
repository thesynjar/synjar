import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceService } from './workspace.service';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let prismaStub: Partial<PrismaService>;
  let eventEmitterStub: Partial<EventEmitter2>;

  beforeEach(async () => {
    // Mock transaction client that will be passed to forUser callback
    const mockTx = {
      workspace: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      workspaceMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    // Create stubs following CLAUDE.md guidelines (stub > mock)
    prismaStub = {
      // forUser executes the callback immediately with mockTx
      forUser: jest.fn().mockImplementation((_userId, callback) => {
        return callback(mockTx);
      }),
      workspace: mockTx.workspace as unknown as PrismaService['workspace'],
      workspaceMember: mockTx.workspaceMember as unknown as PrismaService['workspaceMember'],
      user: mockTx.user as unknown as PrismaService['user'],
    };

    eventEmitterStub = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: EventEmitter2, useValue: eventEmitterStub },
      ],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
  });

  describe('create', () => {
    it('should create workspace with user as owner', async () => {
      // Arrange
      const userId = 'user-id-123';
      const createDto = { name: 'Test Workspace' };
      const expectedWorkspace = {
        id: 'workspace-id-123',
        name: createDto.name,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: userId,
        members: [
          {
            id: 'member-id-123',
            userId,
            workspaceId: 'workspace-id-123',
            role: Role.OWNER,
            user: {
              id: userId,
              email: 'test@example.com',
              name: 'Test User',
            },
          },
        ],
      };

      prismaStub.workspace!.create = jest.fn().mockResolvedValue(expectedWorkspace);

      // Act
      const result = await service.create(userId, createDto);

      // Assert
      expect(result).toEqual(expectedWorkspace);
      expect(prismaStub.forUser).toHaveBeenCalledWith(userId, expect.any(Function));
      expect(prismaStub.workspace!.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          createdById: userId,
          members: {
            create: {
              userId,
              role: Role.OWNER,
            },
          },
        },
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
        },
      });
    });
  });

  describe('findAllForUser', () => {
    it('should return all workspaces for user', async () => {
      // Arrange
      const userId = 'user-id-123';
      const expectedWorkspaces = [
        {
          id: 'workspace-1',
          name: 'Workspace 1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          members: [],
          _count: { documents: 5 },
        },
        {
          id: 'workspace-2',
          name: 'Workspace 2',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
          members: [],
          _count: { documents: 3 },
        },
      ];

      prismaStub.workspace!.findMany = jest.fn().mockResolvedValue(expectedWorkspaces);

      // Act
      const result = await service.findAllForUser(userId);

      // Assert
      expect(result).toEqual(expectedWorkspaces);
      expect(prismaStub.forUser).toHaveBeenCalledWith(userId, expect.any(Function));
      expect(prismaStub.workspace!.findMany).toHaveBeenCalledWith({
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
          _count: {
            select: { documents: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array if user has no workspaces', async () => {
      // Arrange
      const userId = 'user-id-123';
      prismaStub.workspace!.findMany = jest.fn().mockResolvedValue([]);

      // Act
      const result = await service.findAllForUser(userId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return workspace if user is member', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const expectedWorkspace = {
        id: workspaceId,
        name: 'Test Workspace',
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [],
        _count: { documents: 5, publicLinks: 2 },
      };

      prismaStub.workspace!.findUnique = jest.fn().mockResolvedValue(expectedWorkspace);
      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.MEMBER,
      });

      // Act
      const result = await service.findOne(workspaceId, userId);

      // Assert
      expect(result).toEqual(expectedWorkspace);
    });

    it('should throw NotFoundException if workspace does not exist', async () => {
      // Arrange
      const workspaceId = 'non-existent-workspace';
      const userId = 'user-id-123';

      prismaStub.workspace!.findUnique = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(workspaceId, userId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(workspaceId, userId)).rejects.toThrow(
        'Workspace not found',
      );
    });

    it('should throw NotFoundException if user is not member (RLS hides workspace)', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'non-member-user-id';

      // With RLS, workspace is invisible to non-members, so findUnique returns null
      prismaStub.workspace!.findUnique = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(workspaceId, userId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(workspaceId, userId)).rejects.toThrow(
        'Workspace not found',
      );
    });
  });

  describe('update', () => {
    it('should update workspace if user is owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const updateDto = { name: 'Updated Workspace' };

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.OWNER,
      });

      const updatedWorkspace = {
        id: workspaceId,
        name: updateDto.name,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [],
      };

      prismaStub.workspace!.update = jest.fn().mockResolvedValue(updatedWorkspace);

      // Act
      const result = await service.update(workspaceId, userId, updateDto);

      // Assert
      expect(result).toEqual(updatedWorkspace);
      expect(prismaStub.workspace!.update).toHaveBeenCalledWith({
        where: { id: workspaceId },
        data: updateDto,
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
        },
      });
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const updateDto = { name: 'Updated Workspace' };

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.MEMBER, // Not OWNER
      });

      // Act & Assert
      await expect(
        service.update(workspaceId, userId, updateDto),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(workspaceId, userId, updateDto),
      ).rejects.toThrow('Only owner can perform this action');
      expect(prismaStub.workspace!.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete workspace if user is owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.OWNER,
      });

      prismaStub.workspace!.delete = jest.fn().mockResolvedValue({
        id: workspaceId,
        name: 'Deleted Workspace',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      await service.delete(workspaceId, userId);

      // Assert
      expect(prismaStub.workspace!.delete).toHaveBeenCalledWith({
        where: { id: workspaceId },
      });
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.MEMBER,
      });

      // Act & Assert
      await expect(service.delete(workspaceId, userId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaStub.workspace!.delete).not.toHaveBeenCalled();
    });
  });

  describe('addMember', () => {
    it('should add member to workspace if user is owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const ownerId = 'owner-id-123';
      const addMemberDto = {
        userId: 'new-member-id',
        role: Role.MEMBER,
      };

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId: ownerId,
        workspaceId,
        role: Role.OWNER,
      });

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue({
        id: addMemberDto.userId,
        email: 'newmember@example.com',
        name: 'New Member',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const expectedMember = {
        id: 'new-member-record-id',
        userId: addMemberDto.userId,
        workspaceId,
        role: addMemberDto.role,
        user: {
          id: addMemberDto.userId,
          email: 'newmember@example.com',
          name: 'New Member',
        },
      };

      prismaStub.workspaceMember!.create = jest.fn().mockResolvedValue(expectedMember);

      // Act
      const result = await service.addMember(workspaceId, ownerId, addMemberDto);

      // Assert
      expect(result).toEqual(expectedMember);
      expect(prismaStub.workspaceMember!.create).toHaveBeenCalledWith({
        data: {
          workspaceId,
          userId: addMemberDto.userId,
          role: addMemberDto.role,
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
    });

    it('should default to MEMBER role if not specified', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const ownerId = 'owner-id-123';
      const addMemberDto = {
        userId: 'new-member-id',
      };

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId: ownerId,
        workspaceId,
        role: Role.OWNER,
      });

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue({
        id: addMemberDto.userId,
        email: 'newmember@example.com',
        name: 'New Member',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const createSpy = jest.fn().mockResolvedValue({
        id: 'new-member-record-id',
        userId: addMemberDto.userId,
        workspaceId,
        role: Role.MEMBER,
        user: {
          id: addMemberDto.userId,
          email: 'newmember@example.com',
          name: 'New Member',
        },
      });
      prismaStub.workspaceMember!.create = createSpy;

      // Act
      await service.addMember(workspaceId, ownerId, addMemberDto);

      // Assert
      expect(createSpy).toHaveBeenCalledWith({
        data: {
          workspaceId,
          userId: addMemberDto.userId,
          role: Role.MEMBER, // Default value
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
    });

    it('should throw NotFoundException if user to add does not exist', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const ownerId = 'owner-id-123';
      const addMemberDto = {
        userId: 'non-existent-user-id',
      };

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId: ownerId,
        workspaceId,
        role: Role.OWNER,
      });

      prismaStub.user!.findUnique = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.addMember(workspaceId, ownerId, addMemberDto),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.addMember(workspaceId, ownerId, addMemberDto),
      ).rejects.toThrow('User not found');
      expect(prismaStub.workspaceMember!.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const addMemberDto = {
        userId: 'new-member-id',
      };

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.MEMBER, // Not OWNER
      });

      // Act & Assert
      await expect(
        service.addMember(workspaceId, userId, addMemberDto),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaStub.user!.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('should remove member if user is owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const ownerId = 'owner-id-123';
      const memberUserId = 'member-to-remove-id';

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId: ownerId,
        workspaceId,
        role: Role.OWNER,
      });

      prismaStub.workspaceMember!.deleteMany = jest.fn().mockResolvedValue({ count: 1 });

      // Act
      await service.removeMember(workspaceId, ownerId, memberUserId);

      // Assert
      expect(prismaStub.workspaceMember!.deleteMany).toHaveBeenCalledWith({
        where: {
          workspaceId,
          userId: memberUserId,
        },
      });
    });

    it('should throw ForbiddenException if owner tries to remove themselves', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const ownerId = 'owner-id-123';

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId: ownerId,
        workspaceId,
        role: Role.OWNER,
      });

      // Act & Assert
      await expect(
        service.removeMember(workspaceId, ownerId, ownerId),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.removeMember(workspaceId, ownerId, ownerId),
      ).rejects.toThrow('Cannot remove yourself as owner');
      expect(prismaStub.workspaceMember!.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const memberUserId = 'member-to-remove-id';

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.MEMBER,
      });

      // Act & Assert
      await expect(
        service.removeMember(workspaceId, userId, memberUserId),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaStub.workspaceMember!.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getMembers', () => {
    it('should return members if user is member', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const expectedMembers = [
        {
          id: 'member-1',
          userId: 'user-1',
          workspaceId,
          role: Role.OWNER,
          user: { id: 'user-1', email: 'owner@example.com', name: 'Owner' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          workspaceId,
          role: Role.MEMBER,
          user: { id: 'user-2', email: 'member@example.com', name: 'Member' },
        },
      ];

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.MEMBER,
      });

      prismaStub.workspaceMember!.findMany = jest.fn().mockResolvedValue(expectedMembers);

      // Act
      const result = await service.getMembers(workspaceId, userId);

      // Assert
      expect(result).toEqual(expectedMembers);
      expect(prismaStub.workspaceMember!.findMany).toHaveBeenCalledWith({
        where: { workspaceId },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
    });

    it('should throw ForbiddenException if user is not member', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'non-member-user-id';

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.getMembers(workspaceId, userId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaStub.workspaceMember!.findMany).not.toHaveBeenCalled();
    });
  });

  describe('ensureMember', () => {
    it('should return member if user is member', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const expectedMember = {
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.MEMBER,
      };

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue(expectedMember);

      // Act
      const result = await service.ensureMember(workspaceId, userId);

      // Assert
      expect(result).toEqual(expectedMember);
    });

    it('should throw ForbiddenException if user is not member', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'non-member-user-id';

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.ensureMember(workspaceId, userId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.ensureMember(workspaceId, userId)).rejects.toThrow(
        'Not a member of this workspace',
      );
    });
  });

  describe('ensureOwner', () => {
    it('should return member if user is owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const expectedMember = {
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.OWNER,
      };

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue(expectedMember);

      // Act
      const result = await service.ensureOwner(workspaceId, userId);

      // Assert
      expect(result).toEqual(expectedMember);
    });

    it('should throw ForbiddenException if user is member but not owner', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue({
        id: 'member-id',
        userId,
        workspaceId,
        role: Role.MEMBER, // Not OWNER
      });

      // Act & Assert
      await expect(service.ensureOwner(workspaceId, userId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.ensureOwner(workspaceId, userId)).rejects.toThrow(
        'Only owner can perform this action',
      );
    });

    it('should throw ForbiddenException if user is not member at all', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'non-member-user-id';

      prismaStub.workspaceMember!.findUnique = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.ensureOwner(workspaceId, userId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.ensureOwner(workspaceId, userId)).rejects.toThrow(
        'Not a member of this workspace',
      );
    });
  });
});
