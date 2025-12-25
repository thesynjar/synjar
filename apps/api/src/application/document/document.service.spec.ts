import { Test, TestingModule } from '@nestjs/testing';
import { DocumentService } from './document.service';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { ChunkingService } from '../chunking/chunking.service';
import { WorkspaceLimitsService } from '../workspace/workspace-limits.service';
import {
  IEmbeddingsService,
  EMBEDDINGS_SERVICE,
} from '@/domain/document/embeddings.port';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '@/domain/document/storage.port';
import {
  IDocumentRepository,
  DOCUMENT_REPOSITORY,
} from '@/domain/document/document.repository';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ContentType,
  VerificationStatus,
  ProcessingStatus,
} from '@prisma/client';

describe('DocumentService', () => {
  let service: DocumentService;
  let prismaStub: Partial<PrismaService>;
  let workspaceServiceStub: Partial<WorkspaceService>;
  let chunkingServiceStub: Partial<ChunkingService>;
  let workspaceLimitsServiceStub: Partial<WorkspaceLimitsService>;
  let embeddingsServiceStub: Partial<IEmbeddingsService>;
  let storageServiceStub: Partial<IStorageService>;
  let documentRepositoryStub: Partial<IDocumentRepository>;

  beforeEach(async () => {
    // Create stubs following CLAUDE.md guidelines (stub > mock)
    prismaStub = {
      document: {
        update: jest.fn(),
        findUnique: jest.fn(),
      } as unknown as PrismaService['document'],
      chunk: {
        deleteMany: jest.fn(),
      } as unknown as PrismaService['chunk'],
      $executeRaw: jest.fn(),
      // Add RLS context methods
      forUser: jest.fn((_userId, callback) => {
        // Mock transaction object
        const tx = {
          document: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
          },
          chunk: {
            deleteMany: jest.fn(),
          },
        } as any;
        return callback(tx);
      }) as any,
      withoutRls: jest.fn((callback) => {
        // Mock transaction object for system operations
        const tx = {
          tag: {
            upsert: jest.fn(),
          },
        } as any;
        return callback(tx);
      }) as any,
    };

    workspaceServiceStub = {
      ensureMember: jest.fn().mockResolvedValue({
        id: 'member-id',
        userId: 'user-id-123',
        workspaceId: 'workspace-id-123',
        role: 'MEMBER',
      }),
    };

    chunkingServiceStub = {
      parseFile: jest.fn().mockResolvedValue('parsed file content'),
      chunk: jest.fn().mockResolvedValue([
        { content: 'chunk 1', type: 'paragraph', summary: 'summary 1' },
        { content: 'chunk 2', type: 'paragraph', summary: 'summary 2' },
      ]),
    };

    workspaceLimitsServiceStub = {
      checkFileSizeLimit: jest.fn().mockResolvedValue(undefined),
      checkStorageLimit: jest.fn().mockResolvedValue(undefined),
      checkDocumentLimit: jest.fn().mockResolvedValue(undefined),
    };

    embeddingsServiceStub = {
      generateEmbeddings: jest.fn().mockResolvedValue([
        { embedding: [0.1, 0.2, 0.3] },
        { embedding: [0.4, 0.5, 0.6] },
      ]),
    };

    storageServiceStub = {
      upload: jest.fn().mockResolvedValue({
        url: 'https://storage.example.com/file.pdf',
        key: 'file.pdf',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    documentRepositoryStub = {
      findById: jest.fn(),
      findByWorkspace: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: WorkspaceService, useValue: workspaceServiceStub },
        { provide: ChunkingService, useValue: chunkingServiceStub },
        { provide: WorkspaceLimitsService, useValue: workspaceLimitsServiceStub },
        { provide: EMBEDDINGS_SERVICE, useValue: embeddingsServiceStub },
        { provide: STORAGE_SERVICE, useValue: storageServiceStub },
        { provide: DOCUMENT_REPOSITORY, useValue: documentRepositoryStub },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
  });

  describe('create', () => {
    it('should create text document without file', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const createDto = {
        title: 'Test Document',
        content: 'This is test content',
        contentType: ContentType.TEXT,
        tags: ['test', 'example'],
      };

      const expectedDocument = {
        id: 'document-id-123',
        workspaceId,
        title: createDto.title,
        content: createDto.content,
        contentType: ContentType.TEXT,
        verificationStatus: VerificationStatus.UNVERIFIED,
        processingStatus: ProcessingStatus.PENDING,
        tags: [
          { tag: { id: 'tag-test', name: 'test' } },
          { tag: { id: 'tag-example', name: 'example' } },
        ],
        chunks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock withoutRls for tag creation
      prismaStub.withoutRls = jest.fn((callback) => {
        const tx = {
          tag: {
            upsert: jest.fn()
              .mockResolvedValueOnce({ id: 'tag-test', name: 'test' })
              .mockResolvedValueOnce({ id: 'tag-example', name: 'example' }),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Mock forUser for document creation
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            create: jest.fn().mockResolvedValue(expectedDocument),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      const result = await service.create(workspaceId, userId, createDto);

      // Assert
      expect(result).toEqual(expectedDocument);
      expect(workspaceServiceStub.ensureMember).toHaveBeenCalledWith(
        workspaceId,
        userId,
      );
      expect(storageServiceStub.upload).not.toHaveBeenCalled();
    });

    it('should create document with file upload', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const createDto = {
        title: 'Test PDF',
        tags: [],
      };

      const file = {
        buffer: Buffer.from('fake pdf content'),
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      } as Express.Multer.File;

      const expectedDocument = {
        id: 'document-id-123',
        workspaceId,
        title: createDto.title,
        content: 'parsed file content',
        contentType: ContentType.FILE,
        fileUrl: 'https://storage.example.com/file.pdf',
        originalFilename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        verificationStatus: VerificationStatus.UNVERIFIED,
        processingStatus: ProcessingStatus.PENDING,
        tags: [],
        chunks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock withoutRls for tag creation
      prismaStub.withoutRls = jest.fn((callback) => {
        const tx = { tag: { upsert: jest.fn() } } as any;
        return callback(tx);
      }) as any;

      // Mock forUser for document creation
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            create: jest.fn().mockResolvedValue(expectedDocument),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      const result = await service.create(workspaceId, userId, createDto, file);

      // Assert
      expect(workspaceLimitsServiceStub.checkFileSizeLimit).toHaveBeenCalledWith(
        file.size,
        workspaceId,
      );
      expect(workspaceLimitsServiceStub.checkStorageLimit).toHaveBeenCalledWith(
        workspaceId,
        file.size,
      );
      expect(workspaceLimitsServiceStub.checkDocumentLimit).toHaveBeenCalledWith(
        workspaceId,
      );
      expect(storageServiceStub.upload).toHaveBeenCalledWith(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      expect(chunkingServiceStub.parseFile).toHaveBeenCalledWith(
        file.buffer,
        file.mimetype,
      );
      expect(result.contentType).toBe(ContentType.FILE);
      expect(result.fileUrl).toBe('https://storage.example.com/file.pdf');
    });

    it('should throw BadRequestException if file exceeds size limit', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const createDto = {
        title: 'Large File',
        tags: [],
      };

      const largeFile = {
        buffer: Buffer.alloc(11 * 1024 * 1024), // 11MB
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        size: 11 * 1024 * 1024,
      } as Express.Multer.File;

      // Mock the limit service to throw
      workspaceLimitsServiceStub.checkFileSizeLimit = jest
        .fn()
        .mockRejectedValue(new BadRequestException('File size exceeds 10MB limit'));

      // Act & Assert
      await expect(
        service.create(workspaceId, userId, createDto, largeFile),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(workspaceId, userId, createDto, largeFile),
      ).rejects.toThrow('File size exceeds 10MB limit');
      expect(storageServiceStub.upload).not.toHaveBeenCalled();
    });

    it('should pass tags to repository', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const createDto = {
        title: 'Test Document',
        content: 'Content',
        tags: ['test-tag', 'another-tag'],
      };

      const expectedDocument = {
        id: 'document-id-123',
        tags: [],
        chunks: [],
      };

      // Mock withoutRls for tag creation
      prismaStub.withoutRls = jest.fn((callback) => {
        const tx = {
          tag: {
            upsert: jest.fn()
              .mockResolvedValueOnce({ id: 'tag-1', name: 'test-tag' })
              .mockResolvedValueOnce({ id: 'tag-2', name: 'another-tag' }),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Mock forUser for document creation
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            create: jest.fn().mockResolvedValue(expectedDocument),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      await service.create(workspaceId, userId, createDto);

      // Assert
      expect(prismaStub.forUser).toHaveBeenCalled();
    });

    it('should default to TEXT content type when not provided', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const createDto = {
        title: 'Test Document',
        content: 'Content',
        tags: [],
      };

      const expectedDocument = {
        id: 'document-id-123',
        contentType: ContentType.TEXT,
        tags: [],
        chunks: [],
      };

      // Mock withoutRls for tag creation
      prismaStub.withoutRls = jest.fn((callback) => {
        const tx = { tag: { upsert: jest.fn() } } as any;
        return callback(tx);
      }) as any;

      // Mock forUser for document creation
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            create: jest.fn().mockResolvedValue(expectedDocument),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      const result = await service.create(workspaceId, userId, createDto);

      // Assert
      expect(result.contentType).toBe(ContentType.TEXT);
    });
  });

  describe('findAll', () => {
    it('should return paginated documents for workspace', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const query = { page: 1, limit: 20 };

      const documents = [
        {
          id: 'doc-1',
          title: 'Document 1',
          workspaceId,
          tags: [],
          chunks: [],
        },
        {
          id: 'doc-2',
          title: 'Document 2',
          workspaceId,
          tags: [],
          chunks: [],
        },
      ];

      // Mock forUser for document query
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findMany: jest.fn().mockResolvedValue(documents),
            count: jest.fn().mockResolvedValue(2),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      const result = await service.findAll(workspaceId, userId, query);

      // Assert
      expect(result.documents).toEqual(documents);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
      expect(workspaceServiceStub.ensureMember).toHaveBeenCalledWith(
        workspaceId,
        userId,
      );
    });

    it('should pass filters to repository', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const query = {
        tags: ['test', 'example'],
        verificationStatus: VerificationStatus.VERIFIED,
        processingStatus: ProcessingStatus.COMPLETED,
        page: 2,
        limit: 10,
      };

      // Mock forUser
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      await service.findAll(workspaceId, userId, query);

      // Assert
      expect(prismaStub.forUser).toHaveBeenCalled();
    });

    it('should handle pagination correctly', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const query = { page: 3, limit: 10 };

      // Mock forUser
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(25),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      const result = await service.findAll(workspaceId, userId, query);

      // Assert
      expect(result.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('should default to page 1 and limit 20', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const userId = 'user-id-123';
      const query = {};

      // Mock forUser
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      const result = await service.findAll(workspaceId, userId, query);

      // Assert
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });
  });

  describe('findOne', () => {
    it('should return document if user is member', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';

      const expectedDocument = {
        id: documentId,
        workspaceId,
        title: 'Test Document',
        content: 'Content',
        tags: [],
        chunks: [
          { id: 'chunk-1', chunkIndex: 0, chunkType: 'paragraph', content: 'chunk 1' },
          { id: 'chunk-2', chunkIndex: 1, chunkType: 'paragraph', content: 'chunk 2' },
        ],
      };

      // Mock forUser
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(expectedDocument),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      const result = await service.findOne(workspaceId, documentId, userId);

      // Assert
      expect(result).toEqual(expectedDocument);
      expect(workspaceServiceStub.ensureMember).toHaveBeenCalledWith(
        workspaceId,
        userId,
      );
    });

    it('should throw NotFoundException if document does not exist', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'non-existent-document';
      const userId = 'user-id-123';

      // Mock forUser
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act & Assert
      await expect(
        service.findOne(workspaceId, documentId, userId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne(workspaceId, documentId, userId),
      ).rejects.toThrow('Document not found');
    });

    it('should throw NotFoundException if document belongs to different workspace', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';

      // Mock forUser - returns null because RLS would filter it out
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act & Assert
      await expect(
        service.findOne(workspaceId, documentId, userId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne(workspaceId, documentId, userId),
      ).rejects.toThrow('Document not found');
    });
  });

  describe('update', () => {
    it('should update document if user is member', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';
      const updateDto = {
        title: 'Updated Title',
        sourceDescription: 'Updated source',
      };

      const existingDocument = {
        id: documentId,
        workspaceId,
        title: 'Old Title',
        content: 'Content',
        tags: [],
        chunks: [],
      };

      const updatedDocument = {
        id: documentId,
        workspaceId,
        title: updateDto.title,
        sourceDescription: updateDto.sourceDescription,
        content: 'Content',
        tags: [],
        chunks: [],
      };

      // Mock forUser for update
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(existingDocument),
            update: jest.fn().mockResolvedValue(updatedDocument),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      const result = await service.update(workspaceId, documentId, userId, updateDto);

      // Assert
      expect(result).toEqual(updatedDocument);
      expect(workspaceServiceStub.ensureMember).toHaveBeenCalledWith(
        workspaceId,
        userId,
      );
    });

    it('should set processingStatus to PENDING when content changes', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';
      const updateDto = {
        content: 'New content',
      };

      const existingDocument = {
        id: documentId,
        workspaceId,
        content: 'Old content',
        tags: [],
        chunks: [],
      };

      const updatedDocument = {
        id: documentId,
        tags: [],
        chunks: [],
        processingStatus: ProcessingStatus.PENDING,
      };

      // Mock forUser
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(existingDocument),
            update: jest.fn().mockResolvedValue(updatedDocument),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      const result = await service.update(workspaceId, documentId, userId, updateDto);

      // Assert
      expect(result.processingStatus).toBe(ProcessingStatus.PENDING);
    });

    it('should not change processingStatus when content stays the same', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';
      const updateDto = {
        title: 'New title',
      };

      const existingDocument = {
        id: documentId,
        workspaceId,
        content: 'Same content',
        tags: [],
        chunks: [],
      };

      const updatedDocument = {
        id: documentId,
        title: 'New title',
        tags: [],
        chunks: [],
      };

      // Mock forUser
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(existingDocument),
            update: jest.fn().mockResolvedValue(updatedDocument),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act
      await service.update(workspaceId, documentId, userId, updateDto);

      // Assert - processingStatus should be undefined (not changed)
      expect(prismaStub.forUser).toHaveBeenCalled();
    });

    it('should throw NotFoundException if document does not exist', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'non-existent-document';
      const userId = 'user-id-123';
      const updateDto = { title: 'New title' };

      // Mock forUser
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act & Assert
      await expect(
        service.update(workspaceId, documentId, userId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if document belongs to different workspace', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';
      const updateDto = { title: 'New title' };

      // Mock forUser - returns null because RLS filters it out
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act & Assert
      await expect(
        service.update(workspaceId, documentId, userId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete document and file if user is member', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';

      const document = {
        id: documentId,
        workspaceId,
        fileUrl: 'https://storage.example.com/files/a1b2c3d4-e5f6-7890-abcd-ef1234567890-test.pdf',
        tags: [],
        chunks: [],
      };

      // Mock forUser for both find and delete
      let callCount = 0;
      prismaStub.forUser = jest.fn((_userId, callback) => {
        callCount++;
        if (callCount === 1) {
          // First call - find document
          const tx = {
            document: {
              findFirst: jest.fn().mockResolvedValue(document),
            },
          } as any;
          return callback(tx);
        } else {
          // Second call - delete document
          const tx = {
            document: {
              delete: jest.fn().mockResolvedValue(undefined),
            },
          } as any;
          return callback(tx);
        }
      }) as any;

      // Act
      await service.delete(workspaceId, documentId, userId);

      // Assert
      expect(workspaceServiceStub.ensureMember).toHaveBeenCalledWith(
        workspaceId,
        userId,
      );
      expect(storageServiceStub.delete).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890-test.pdf');
    });

    it('should delete document without file if no fileUrl', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';

      const document = {
        id: documentId,
        workspaceId,
        fileUrl: null,
        tags: [],
        chunks: [],
      };

      // Mock forUser
      let callCount = 0;
      prismaStub.forUser = jest.fn((_userId, callback) => {
        callCount++;
        if (callCount === 1) {
          const tx = {
            document: {
              findFirst: jest.fn().mockResolvedValue(document),
            },
          } as any;
          return callback(tx);
        } else {
          const tx = {
            document: {
              delete: jest.fn().mockResolvedValue(undefined),
            },
          } as any;
          return callback(tx);
        }
      }) as any;

      // Act
      await service.delete(workspaceId, documentId, userId);

      // Assert
      expect(storageServiceStub.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if document does not exist', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'non-existent-document';
      const userId = 'user-id-123';

      // Mock forUser
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act & Assert
      await expect(
        service.delete(workspaceId, documentId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if document belongs to different workspace', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';

      // Mock forUser - returns null because RLS filters it out
      prismaStub.forUser = jest.fn((_userId, callback) => {
        const tx = {
          document: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        } as any;
        return callback(tx);
      }) as any;

      // Act & Assert
      await expect(
        service.delete(workspaceId, documentId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should continue deletion even if storage delete fails', async () => {
      // Arrange
      const workspaceId = 'workspace-id-123';
      const documentId = 'document-id-123';
      const userId = 'user-id-123';

      const document = {
        id: documentId,
        workspaceId,
        fileUrl: 'https://storage.example.com/files/a1b2c3d4-e5f6-7890-abcd-ef1234567890-test.pdf',
        tags: [],
        chunks: [],
      };

      storageServiceStub.delete = jest
        .fn()
        .mockRejectedValue(new Error('Storage error'));

      // Mock forUser
      let callCount = 0;
      prismaStub.forUser = jest.fn((_userId, callback) => {
        callCount++;
        if (callCount === 1) {
          const tx = {
            document: {
              findFirst: jest.fn().mockResolvedValue(document),
            },
          } as any;
          return callback(tx);
        } else {
          const tx = {
            document: {
              delete: jest.fn().mockResolvedValue(undefined),
            },
          } as any;
          return callback(tx);
        }
      }) as any;

      // Act
      await service.delete(workspaceId, documentId, userId);

      // Assert - deletion should still happen
      expect(prismaStub.forUser).toHaveBeenCalledTimes(2);
    });
  });
});
