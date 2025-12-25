import { Test, TestingModule } from '@nestjs/testing';
import { PublicLinkService } from './public-link.service';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import {
  IEmbeddingsService,
  EMBEDDINGS_SERVICE,
} from '@/domain/document/embeddings.port';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '@/domain/document/storage.port';
import {
  IPublicLinkRepository,
  PUBLIC_LINK_REPOSITORY,
} from '@/domain/public-link/public-link.repository';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('PublicLinkService', () => {
  let service: PublicLinkService;
  let prismaStub: Partial<PrismaService>;
  let workspaceServiceStub: Partial<WorkspaceService>;
  let publicLinkRepositoryStub: Partial<IPublicLinkRepository>;
  let embeddingsServiceStub: Partial<IEmbeddingsService>;
  let storageServiceStub: Partial<IStorageService>;

  beforeEach(async () => {
    prismaStub = {
      forUser: jest.fn(),
      withoutRls: jest.fn(),
    } as any;

    workspaceServiceStub = {
      ensureMember: jest.fn().mockResolvedValue({
        id: 'member-id',
        userId: 'user-id-123',
        workspaceId: 'workspace-id-123',
        role: 'MEMBER',
      }),
    };

    publicLinkRepositoryStub = {
      createWithUser: jest.fn(),
      findAllWithUser: jest.fn(),
      findOneWithUser: jest.fn(),
      deleteWithUser: jest.fn(),
      findByTokenWithWorkspace: jest.fn(),
    };

    embeddingsServiceStub = {
      generateEmbedding: jest.fn().mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
        tokensUsed: 10,
      }),
    };

    storageServiceStub = {
      getSignedUrl: jest.fn().mockResolvedValue('https://signed.example.com/file.pdf?signature=abc'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicLinkService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: WorkspaceService, useValue: workspaceServiceStub },
        { provide: PUBLIC_LINK_REPOSITORY, useValue: publicLinkRepositoryStub },
        { provide: EMBEDDINGS_SERVICE, useValue: embeddingsServiceStub },
        { provide: STORAGE_SERVICE, useValue: storageServiceStub },
      ],
    }).compile();

    service = module.get<PublicLinkService>(PublicLinkService);
  });

  describe('getSignedFileUrl (private method via reflection)', () => {
    // Access private method for testing
    const callGetSignedFileUrl = async (service: PublicLinkService, fileUrl: string | null) => {
      return (service as any).getSignedFileUrl(fileUrl);
    };

    it('should return null for null fileUrl', async () => {
      const result = await callGetSignedFileUrl(service, null);
      expect(result).toBeNull();
      expect(storageServiceStub.getSignedUrl).not.toHaveBeenCalled();
    });

    it('should return null for empty string fileUrl', async () => {
      const result = await callGetSignedFileUrl(service, '');
      expect(result).toBeNull();
      expect(storageServiceStub.getSignedUrl).not.toHaveBeenCalled();
    });

    it('should return null for fileUrl without key (ending with /)', async () => {
      const result = await callGetSignedFileUrl(service, 'https://storage.example.com/files/');
      expect(result).toBeNull();
      expect(storageServiceStub.getSignedUrl).not.toHaveBeenCalled();
    });

    it('should return null for fileUrl with invalid UUID format', async () => {
      const result = await callGetSignedFileUrl(service, 'https://storage.example.com/files/invalid-file.pdf');
      expect(result).toBeNull();
      expect(storageServiceStub.getSignedUrl).not.toHaveBeenCalled();
    });

    it('should return null for fileUrl with short UUID-like string', async () => {
      const result = await callGetSignedFileUrl(service, 'https://storage.example.com/files/a1b2c3d4-test.pdf');
      expect(result).toBeNull();
      expect(storageServiceStub.getSignedUrl).not.toHaveBeenCalled();
    });

    it('should generate signed URL for valid UUID-prefixed fileUrl', async () => {
      const validFileUrl = 'https://storage.example.com/files/a1b2c3d4-e5f6-7890-abcd-ef1234567890-document.pdf';

      const result = await callGetSignedFileUrl(service, validFileUrl);

      expect(result).toBe('https://signed.example.com/file.pdf?signature=abc');
      expect(storageServiceStub.getSignedUrl).toHaveBeenCalledWith(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890-document.pdf'
      );
    });

    it('should generate signed URL for UUID with uppercase letters', async () => {
      const validFileUrl = 'https://storage.example.com/files/A1B2C3D4-E5F6-7890-ABCD-EF1234567890-document.pdf';

      const result = await callGetSignedFileUrl(service, validFileUrl);

      expect(result).toBe('https://signed.example.com/file.pdf?signature=abc');
      expect(storageServiceStub.getSignedUrl).toHaveBeenCalledWith(
        'A1B2C3D4-E5F6-7890-ABCD-EF1234567890-document.pdf'
      );
    });

    it('should return null and log error when storageService throws', async () => {
      const validFileUrl = 'https://storage.example.com/files/a1b2c3d4-e5f6-7890-abcd-ef1234567890-document.pdf';
      storageServiceStub.getSignedUrl = jest.fn().mockRejectedValue(new Error('S3 error'));

      const result = await callGetSignedFileUrl(service, validFileUrl);

      expect(result).toBeNull();
      expect(storageServiceStub.getSignedUrl).toHaveBeenCalled();
    });

    it('should reject path traversal attempts', async () => {
      const maliciousUrls = [
        'https://storage.example.com/files/../../../etc/passwd',
        'https://storage.example.com/files/..%2F..%2Fetc%2Fpasswd',
        'https://storage.example.com/files/secret-file.pdf',
      ];

      for (const url of maliciousUrls) {
        const result = await callGetSignedFileUrl(service, url);
        expect(result).toBeNull();
      }
    });
  });

  describe('create', () => {
    it('should create public link with valid data', async () => {
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const dto = { name: 'Test Link', allowedTags: ['support'] };

      const expectedLink = {
        id: 'link-id-123',
        workspaceId,
        token: expect.any(String),
        name: dto.name,
        allowedTags: dto.allowedTags,
        isActive: true,
        createdAt: new Date(),
      };

      publicLinkRepositoryStub.createWithUser = jest.fn().mockResolvedValue(expectedLink);

      const result = await service.create(workspaceId, userId, dto);

      expect(workspaceServiceStub.ensureMember).toHaveBeenCalledWith(workspaceId, userId);
      expect(publicLinkRepositoryStub.createWithUser).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          workspaceId,
          name: dto.name,
          allowedTags: dto.allowedTags,
          token: expect.any(String),
        })
      );
      expect(result).toEqual(expectedLink);
    });

    it('should throw BadRequestException for past expiration date', async () => {
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const pastDate = new Date(Date.now() - 1000);
      const dto = { expiresAt: pastDate };

      await expect(service.create(workspaceId, userId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid date format', async () => {
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const dto = { expiresAt: new Date('invalid') };

      await expect(service.create(workspaceId, userId, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return all public links for workspace', async () => {
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const expectedLinks = [
        { id: 'link-1', name: 'Link 1' },
        { id: 'link-2', name: 'Link 2' },
      ];

      publicLinkRepositoryStub.findAllWithUser = jest.fn().mockResolvedValue(expectedLinks);

      const result = await service.findAll(workspaceId, userId);

      expect(workspaceServiceStub.ensureMember).toHaveBeenCalledWith(workspaceId, userId);
      expect(publicLinkRepositoryStub.findAllWithUser).toHaveBeenCalledWith(userId, workspaceId);
      expect(result).toEqual(expectedLinks);
    });
  });

  describe('findOne', () => {
    it('should return public link by id', async () => {
      const workspaceId = 'workspace-id-123';
      const linkId = 'link-id-123';
      const userId = 'user-id-123';
      const expectedLink = { id: linkId, name: 'Test Link' };

      publicLinkRepositoryStub.findOneWithUser = jest.fn().mockResolvedValue(expectedLink);

      const result = await service.findOne(workspaceId, linkId, userId);

      expect(result).toEqual(expectedLink);
    });

    it('should throw NotFoundException if link not found', async () => {
      const workspaceId = 'workspace-id-123';
      const linkId = 'non-existent';
      const userId = 'user-id-123';

      publicLinkRepositoryStub.findOneWithUser = jest.fn().mockResolvedValue(null);

      await expect(service.findOne(workspaceId, linkId, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete public link', async () => {
      const workspaceId = 'workspace-id-123';
      const linkId = 'link-id-123';
      const userId = 'user-id-123';
      const existingLink = { id: linkId, name: 'Test Link' };

      publicLinkRepositoryStub.findOneWithUser = jest.fn().mockResolvedValue(existingLink);
      publicLinkRepositoryStub.deleteWithUser = jest.fn().mockResolvedValue(undefined);

      await service.delete(workspaceId, linkId, userId);

      expect(publicLinkRepositoryStub.deleteWithUser).toHaveBeenCalledWith(userId, linkId);
    });

    it('should throw NotFoundException if link not found', async () => {
      const workspaceId = 'workspace-id-123';
      const linkId = 'non-existent';
      const userId = 'user-id-123';

      publicLinkRepositoryStub.findOneWithUser = jest.fn().mockResolvedValue(null);

      await expect(service.delete(workspaceId, linkId, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateToken', () => {
    const validLink = {
      id: 'link-id-123',
      token: 'valid-token',
      isActive: true,
      expiresAt: null,
      allowedTags: [],
      workspace: {
        id: 'workspace-id-123',
        name: 'Test Workspace',
        createdById: 'owner-id-123',
      },
    };

    it('should return link for valid active token', async () => {
      publicLinkRepositoryStub.findByTokenWithWorkspace = jest.fn().mockResolvedValue(validLink);

      const result = await service.validateToken('valid-token');

      expect(result).toEqual(validLink);
    });

    it('should throw NotFoundException for invalid token', async () => {
      publicLinkRepositoryStub.findByTokenWithWorkspace = jest.fn().mockResolvedValue(null);

      await expect(service.validateToken('invalid-token')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for inactive link', async () => {
      const inactiveLink = { ...validLink, isActive: false };
      publicLinkRepositoryStub.findByTokenWithWorkspace = jest.fn().mockResolvedValue(inactiveLink);

      await expect(service.validateToken('valid-token')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for expired link', async () => {
      const expiredLink = { ...validLink, expiresAt: new Date(Date.now() - 1000) };
      publicLinkRepositoryStub.findByTokenWithWorkspace = jest.fn().mockResolvedValue(expiredLink);

      await expect(service.validateToken('valid-token')).rejects.toThrow(ForbiddenException);
    });

    it('should accept link with future expiration', async () => {
      const futureLink = { ...validLink, expiresAt: new Date(Date.now() + 86400000) };
      publicLinkRepositoryStub.findByTokenWithWorkspace = jest.fn().mockResolvedValue(futureLink);

      const result = await service.validateToken('valid-token');

      expect(result).toEqual(futureLink);
    });
  });
});
