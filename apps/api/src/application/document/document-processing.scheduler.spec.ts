import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DocumentProcessingScheduler } from './document-processing.scheduler';
import { DocumentProcessorService } from './document-processor.service';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';

describe('DocumentProcessingScheduler', () => {
  let scheduler: DocumentProcessingScheduler;
  let prismaStub: Partial<PrismaService>;
  let documentProcessorStub: Partial<DocumentProcessorService>;
  let configServiceStub: Partial<ConfigService>;

  // Mock data - now uses workspaceId instead of full workspace object
  const mockWorkspaceId = 'workspace-1';

  const mockDocuments = [
    { id: 'doc-1', title: 'Document 1' },
    { id: 'doc-2', title: 'Document 2' },
    { id: 'doc-3', title: 'Document 3' },
  ];

  beforeEach(async () => {
    // Reset stubs
    prismaStub = {
      $queryRaw: jest.fn(),
      workspaceProcessingQueue: {
        findMany: jest.fn(),
        update: jest.fn(),
      } as any,
      forWorkspace: jest.fn(),
    };

    documentProcessorStub = {
      processDocument: jest.fn().mockResolvedValue(undefined),
    };

    configServiceStub = {
      get: jest.fn().mockImplementation((key: string, defaultValue: number) => {
        if (key === 'DOCUMENT_PROCESSING_BATCH_SIZE') return 5;
        if (key === 'DOCUMENT_PROCESSING_TIMEOUT_MS') return 60000;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentProcessingScheduler,
        { provide: PrismaService, useValue: prismaStub },
        { provide: DocumentProcessorService, useValue: documentProcessorStub },
        { provide: ConfigService, useValue: configServiceStub },
      ],
    }).compile();

    scheduler = module.get<DocumentProcessingScheduler>(
      DocumentProcessingScheduler,
    );
  });

  describe('Scenario 1: No pending documents', () => {
    it('should acquire lock, find no workspaces with pending, and release lock', async () => {
      // Given: No workspaces with pending documents in queue
      (prismaStub.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

      (prismaStub.workspaceProcessingQueue!.findMany as jest.Mock).mockResolvedValue([]);

      // When
      await scheduler.processPendingDocuments();

      // Then
      expect(prismaStub.$queryRaw).toHaveBeenCalledTimes(2); // Lock + Unlock
      expect(documentProcessorStub.processDocument).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 2: Single workspace, 3 documents', () => {
    it('should process all 3 documents in order', async () => {
      // Given: Workspace with 3 documents PENDING
      (prismaStub.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

      (prismaStub.workspaceProcessingQueue!.findMany as jest.Mock).mockResolvedValue([
        { workspaceId: mockWorkspaceId },
      ]);

      (prismaStub.workspaceProcessingQueue!.update as jest.Mock).mockResolvedValue({});

      (prismaStub.forWorkspace as jest.Mock).mockImplementation(
        async (_workspaceId, cb) => {
          const tx = {
            document: {
              findMany: jest.fn().mockResolvedValue(mockDocuments),
            },
          };
          return cb(tx);
        },
      );

      // When
      await scheduler.processPendingDocuments();

      // Then
      expect(prismaStub.forWorkspace).toHaveBeenCalledWith(mockWorkspaceId, expect.any(Function));
      expect(documentProcessorStub.processDocument).toHaveBeenCalledTimes(3);
      expect(documentProcessorStub.processDocument).toHaveBeenNthCalledWith(1, 'doc-1');
      expect(documentProcessorStub.processDocument).toHaveBeenNthCalledWith(2, 'doc-2');
      expect(documentProcessorStub.processDocument).toHaveBeenNthCalledWith(3, 'doc-3');
    });
  });

  describe('Scenario 3: Batch limit (>5 docs)', () => {
    it('should process only batch size documents per cycle', async () => {
      // Given: Workspace with 7 documents PENDING, batch size = 5
      const sevenDocs = Array.from({ length: 7 }, (_, i) => ({
        id: `doc-${i + 1}`,
        title: `Document ${i + 1}`,
      }));

      (prismaStub.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

      (prismaStub.workspaceProcessingQueue!.findMany as jest.Mock).mockResolvedValue([
        { workspaceId: mockWorkspaceId },
      ]);

      (prismaStub.workspaceProcessingQueue!.update as jest.Mock).mockResolvedValue({});

      // Mock returns only 5 docs (batch limit enforced at query level)
      (prismaStub.forWorkspace as jest.Mock).mockImplementation(
        async (_workspaceId, cb) => {
          const tx = {
            document: {
              findMany: jest.fn().mockResolvedValue(sevenDocs.slice(0, 5)),
            },
          };
          return cb(tx);
        },
      );

      // When
      await scheduler.processPendingDocuments();

      // Then: Only 5 documents processed
      expect(documentProcessorStub.processDocument).toHaveBeenCalledTimes(5);
    });
  });

  describe('Scenario 4: Processing error (continues)', () => {
    it('should continue processing after error on one document', async () => {
      // Given: 3 documents PENDING, doc-2 throws error
      (prismaStub.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

      (prismaStub.workspaceProcessingQueue!.findMany as jest.Mock).mockResolvedValue([
        { workspaceId: mockWorkspaceId },
      ]);

      (prismaStub.workspaceProcessingQueue!.update as jest.Mock).mockResolvedValue({});

      (prismaStub.forWorkspace as jest.Mock).mockImplementation(
        async (_workspaceId, cb) => {
          const tx = {
            document: {
              findMany: jest.fn().mockResolvedValue(mockDocuments),
            },
          };
          return cb(tx);
        },
      );

      // doc-2 fails
      (documentProcessorStub.processDocument as jest.Mock)
        .mockResolvedValueOnce(undefined) // doc-1 OK
        .mockRejectedValueOnce(new Error('Processing failed')) // doc-2 FAIL
        .mockResolvedValueOnce(undefined); // doc-3 OK

      // When
      await scheduler.processPendingDocuments();

      // Then: All 3 documents attempted, error doesn't stop processing
      expect(documentProcessorStub.processDocument).toHaveBeenCalledTimes(3);
      expect(documentProcessorStub.processDocument).toHaveBeenNthCalledWith(1, 'doc-1');
      expect(documentProcessorStub.processDocument).toHaveBeenNthCalledWith(2, 'doc-2');
      expect(documentProcessorStub.processDocument).toHaveBeenNthCalledWith(3, 'doc-3');
    });

    it('should release lock even when processing fails', async () => {
      // Given: Lock acquired, but workspaceProcessingQueue throws error
      (prismaStub.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

      (prismaStub.workspaceProcessingQueue!.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      // When
      await scheduler.processPendingDocuments();

      // Then: Lock should be released despite error
      expect(prismaStub.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('Scenario 5: Distributed lock (concurrent instances)', () => {
    it('should return immediately if lock cannot be acquired', async () => {
      // Given: Another instance already has lock
      (prismaStub.$queryRaw as jest.Mock).mockResolvedValueOnce([
        { pg_try_advisory_lock: false },
      ]);

      // When
      await scheduler.processPendingDocuments();

      // Then: No processing, no unlock attempt
      expect(prismaStub.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prismaStub.workspaceProcessingQueue!.findMany).not.toHaveBeenCalled();
      expect(documentProcessorStub.processDocument).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 6: Timeout protection', () => {
    it('should timeout if processing takes too long', async () => {
      // Given: Timeout set to 100ms, processing takes 500ms
      (configServiceStub.get as jest.Mock).mockImplementation(
        (key: string, defaultValue: number) => {
          if (key === 'DOCUMENT_PROCESSING_TIMEOUT_MS') return 100; // 100ms timeout
          if (key === 'DOCUMENT_PROCESSING_BATCH_SIZE') return 5;
          return defaultValue;
        },
      );

      (prismaStub.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

      (prismaStub.workspaceProcessingQueue!.findMany as jest.Mock).mockResolvedValue([
        { workspaceId: mockWorkspaceId },
      ]);

      (prismaStub.workspaceProcessingQueue!.update as jest.Mock).mockResolvedValue({});

      (prismaStub.forWorkspace as jest.Mock).mockImplementation(
        async (_workspaceId, cb) => {
          const tx = {
            document: {
              findMany: jest.fn().mockResolvedValue([{ id: 'doc-slow', title: 'Slow Doc' }]),
            },
          };
          return cb(tx);
        },
      );

      // Slow processing (500ms)
      (documentProcessorStub.processDocument as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );

      // When
      await scheduler.processPendingDocuments();

      // Then: Processing should timeout (error logged, but continues)
      expect(documentProcessorStub.processDocument).toHaveBeenCalledTimes(1);
      // Lock should still be released
      expect(prismaStub.$queryRaw).toHaveBeenCalledTimes(2);
    }, 10000); // Extend Jest timeout for this test
  });

  describe('Multiple workspaces (fair processing)', () => {
    it('should process documents from multiple workspaces', async () => {
      // Given: 2 workspaces with pending documents
      const workspace1Id = 'workspace-1';
      const workspace2Id = 'workspace-2';

      (prismaStub.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

      (prismaStub.workspaceProcessingQueue!.findMany as jest.Mock).mockResolvedValue([
        { workspaceId: workspace1Id },
        { workspaceId: workspace2Id },
      ]);

      (prismaStub.workspaceProcessingQueue!.update as jest.Mock).mockResolvedValue({});

      (prismaStub.forWorkspace as jest.Mock).mockImplementation(
        async (workspaceId, cb) => {
          const docs =
            workspaceId === workspace1Id
              ? [{ id: 'doc-w1', title: 'Doc W1' }]
              : [{ id: 'doc-w2', title: 'Doc W2' }];
          const tx = {
            document: {
              findMany: jest.fn().mockResolvedValue(docs),
            },
          };
          return cb(tx);
        },
      );

      // When
      await scheduler.processPendingDocuments();

      // Then: Both workspaces processed
      expect(prismaStub.forWorkspace).toHaveBeenCalledTimes(2);
      expect(prismaStub.forWorkspace).toHaveBeenCalledWith(workspace1Id, expect.any(Function));
      expect(prismaStub.forWorkspace).toHaveBeenCalledWith(workspace2Id, expect.any(Function));
      expect(documentProcessorStub.processDocument).toHaveBeenCalledTimes(2);
      expect(documentProcessorStub.processDocument).toHaveBeenCalledWith('doc-w1');
      expect(documentProcessorStub.processDocument).toHaveBeenCalledWith('doc-w2');
    });
  });

  describe('Configuration', () => {
    it('should use configured batch size', async () => {
      // Given: Custom batch size = 2
      (configServiceStub.get as jest.Mock).mockImplementation(
        (key: string, defaultValue: number) => {
          if (key === 'DOCUMENT_PROCESSING_BATCH_SIZE') return 2;
          if (key === 'DOCUMENT_PROCESSING_TIMEOUT_MS') return 60000;
          return defaultValue;
        },
      );

      (prismaStub.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

      (prismaStub.workspaceProcessingQueue!.findMany as jest.Mock).mockResolvedValue([
        { workspaceId: mockWorkspaceId },
      ]);

      (prismaStub.workspaceProcessingQueue!.update as jest.Mock).mockResolvedValue({});

      const findManyMock = jest.fn().mockResolvedValue([
        { id: 'doc-1', title: 'Doc 1' },
        { id: 'doc-2', title: 'Doc 2' },
      ]);

      (prismaStub.forWorkspace as jest.Mock).mockImplementation(
        async (_workspaceId, cb) => {
          const tx = {
            document: {
              findMany: findManyMock,
            },
          };
          return cb(tx);
        },
      );

      // When
      await scheduler.processPendingDocuments();

      // Then: findMany called with take: 2
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
        }),
      );
    });
  });

  describe('lastProcessedAt update', () => {
    it('should update lastProcessedAt after processing workspace', async () => {
      // Given: Workspace with pending documents
      (prismaStub.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ pg_try_advisory_lock: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

      (prismaStub.workspaceProcessingQueue!.findMany as jest.Mock).mockResolvedValue([
        { workspaceId: mockWorkspaceId },
      ]);

      (prismaStub.workspaceProcessingQueue!.update as jest.Mock).mockResolvedValue({});

      (prismaStub.forWorkspace as jest.Mock).mockImplementation(
        async (_workspaceId, cb) => {
          const tx = {
            document: {
              findMany: jest.fn().mockResolvedValue([{ id: 'doc-1', title: 'Doc 1' }]),
            },
          };
          return cb(tx);
        },
      );

      // When
      await scheduler.processPendingDocuments();

      // Then: lastProcessedAt should be updated
      expect(prismaStub.workspaceProcessingQueue!.update).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId },
        data: { lastProcessedAt: expect.any(Date) },
      });
    });
  });
});
