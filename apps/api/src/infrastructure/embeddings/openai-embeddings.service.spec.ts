import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddingsService } from './openai-embeddings.service';

const mockEmbeddingsCreate = jest.fn();

// Mock OpenAI module
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: mockEmbeddingsCreate,
    },
  }));
});

describe('OpenAIEmbeddingsService', () => {
  let service: OpenAIEmbeddingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAIEmbeddingsService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('test-api-key'),
            get: jest.fn().mockReturnValue('test-org-id'),
          },
        },
      ],
    }).compile();

    service = module.get<OpenAIEmbeddingsService>(OpenAIEmbeddingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateEmbedding', () => {
    it('should throw error for empty string', async () => {
      // Arrange & Act & Assert
      await expect(service.generateEmbedding('')).rejects.toThrow(
        'Cannot generate embedding: input text is empty or whitespace-only (length: 0)',
      );
    });

    it('should throw error for whitespace-only string', async () => {
      // Arrange & Act & Assert
      await expect(service.generateEmbedding('   ')).rejects.toThrow(
        'Cannot generate embedding: input text is empty or whitespace-only (length: 3)',
      );
    });

    it('should throw error for tab and newline only string', async () => {
      // Arrange & Act & Assert
      await expect(service.generateEmbedding('\t\n  ')).rejects.toThrow(
        'Cannot generate embedding: input text is empty or whitespace-only (length: 4)',
      );
    });

    it('should generate embedding for valid text', async () => {
      // Arrange
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
        usage: { total_tokens: 5 },
      });

      // Act
      const result = await service.generateEmbedding('valid text');

      // Assert
      expect(result).toEqual({
        embedding: mockEmbedding,
        tokenCount: 5,
      });
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'valid text',
      });
    });

    it('should not call OpenAI API for empty text', async () => {
      // Arrange & Act
      try {
        await service.generateEmbedding('');
      } catch {
        // Expected error
      }

      // Assert
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    });
  });

  describe('generateEmbeddings', () => {
    it('should throw error for empty array', async () => {
      // Arrange & Act & Assert
      await expect(service.generateEmbeddings([])).rejects.toThrow(
        'Cannot generate embeddings: input array is empty',
      );
    });

    it('should throw error for array with empty string', async () => {
      // Arrange & Act & Assert
      await expect(
        service.generateEmbeddings(['valid text', '']),
      ).rejects.toThrow(
        'Cannot generate embeddings: 1 of 2 texts are empty at indices [1]',
      );
    });

    it('should throw error for array with whitespace-only string', async () => {
      // Arrange & Act & Assert
      await expect(
        service.generateEmbeddings(['valid text', '   ']),
      ).rejects.toThrow(
        'Cannot generate embeddings: 1 of 2 texts are empty at indices [1]',
      );
    });

    it('should throw error with all indices of empty strings', async () => {
      // Arrange & Act & Assert
      await expect(
        service.generateEmbeddings(['', 'valid', '   ', 'also valid', '\t\n']),
      ).rejects.toThrow(
        'Cannot generate embeddings: 3 of 5 texts are empty at indices [0, 2, 4]',
      );
    });

    it('should throw error for array with mixed valid and empty strings at multiple indices', async () => {
      // Arrange & Act & Assert
      await expect(
        service.generateEmbeddings(['', '', 'valid']),
      ).rejects.toThrow(
        'Cannot generate embeddings: 2 of 3 texts are empty at indices [0, 1]',
      );
    });

    it('should generate embeddings for valid texts array', async () => {
      // Arrange
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: mockEmbeddings[0] }, { embedding: mockEmbeddings[1] }],
        usage: { total_tokens: 10 },
      });

      // Act
      const result = await service.generateEmbeddings(['text one', 'text two']);

      // Assert
      expect(result).toEqual([
        { embedding: mockEmbeddings[0], tokenCount: 5 },
        { embedding: mockEmbeddings[1], tokenCount: 5 },
      ]);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['text one', 'text two'],
      });
    });

    it('should not call OpenAI API for empty array', async () => {
      // Arrange & Act
      try {
        await service.generateEmbeddings([]);
      } catch {
        // Expected error
      }

      // Assert
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    });

    it('should not call OpenAI API when array contains empty strings', async () => {
      // Arrange & Act
      try {
        await service.generateEmbeddings(['valid', '']);
      } catch {
        // Expected error
      }

      // Assert
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    });
  });
});
