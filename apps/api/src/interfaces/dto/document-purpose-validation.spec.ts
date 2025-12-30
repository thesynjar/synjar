import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateDocumentDto, UpdateDocumentDto } from './document.dto';

/**
 * Document Purpose DTO Validation Unit Tests
 *
 * This test suite validates the DTO validation for Document Purpose enum:
 * 1. CreateDocumentDto - purpose field validation (@IsEnum(DocumentPurpose))
 * 2. UpdateDocumentDto - purpose field validation (@IsEnum(DocumentPurpose))
 *
 * Test scenarios:
 * - Rejection of invalid purpose value
 * - Acceptance of valid KNOWLEDGE purpose
 * - Acceptance of valid INSTRUCTION purpose
 * - Optional purpose field (no validation error when not provided)
 *
 * Related:
 * - document.dto.ts (lines 60-61, 103-105)
 * - Spec: 2025-12-30-22-00-document-purpose-review-findings.md (H1)
 */
describe('Document Purpose DTO Validation', () => {
  describe('CreateDocumentDto', () => {
    it('should accept valid KNOWLEDGE purpose', async () => {
      // Arrange
      const dto = plainToInstance(CreateDocumentDto, {
        title: 'Test Document',
        content: 'Test content',
        purpose: 'KNOWLEDGE',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should accept valid INSTRUCTION purpose', async () => {
      // Arrange
      const dto = plainToInstance(CreateDocumentDto, {
        title: 'Test Document',
        content: 'Test content',
        purpose: 'INSTRUCTION',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid purpose value', async () => {
      // Arrange
      const dto = plainToInstance(CreateDocumentDto, {
        title: 'Test Document',
        content: 'Test content',
        purpose: 'INVALID',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeDefined();
      expect(purposeError?.constraints?.isEnum).toContain(
        'purpose must be one of the following values',
      );
    });

    it('should reject random string as purpose', async () => {
      // Arrange
      const dto = plainToInstance(CreateDocumentDto, {
        title: 'Test Document',
        content: 'Test content',
        purpose: 'RANDOM_VALUE',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeDefined();
    });

    it('should not require purpose (optional field)', async () => {
      // Arrange - purpose not specified
      const dto = plainToInstance(CreateDocumentDto, {
        title: 'Test Document',
        content: 'Test content',
      });

      // Act
      const errors = await validate(dto);

      // Assert - no validation errors related to purpose
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeUndefined();
    });

    it('should reject empty string as purpose', async () => {
      // Arrange
      const dto = plainToInstance(CreateDocumentDto, {
        title: 'Test Document',
        content: 'Test content',
        purpose: '',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeDefined();
    });

    it('should reject lowercase knowledge', async () => {
      // Arrange - enum values are case-sensitive
      const dto = plainToInstance(CreateDocumentDto, {
        title: 'Test Document',
        content: 'Test content',
        purpose: 'knowledge',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeDefined();
    });

    it('should reject lowercase instruction', async () => {
      // Arrange - enum values are case-sensitive
      const dto = plainToInstance(CreateDocumentDto, {
        title: 'Test Document',
        content: 'Test content',
        purpose: 'instruction',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeDefined();
    });
  });

  describe('UpdateDocumentDto', () => {
    it('should accept valid KNOWLEDGE purpose', async () => {
      // Arrange
      const dto = plainToInstance(UpdateDocumentDto, {
        title: 'Updated Document',
        purpose: 'KNOWLEDGE',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should accept valid INSTRUCTION purpose', async () => {
      // Arrange
      const dto = plainToInstance(UpdateDocumentDto, {
        title: 'Updated Document',
        purpose: 'INSTRUCTION',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid purpose value', async () => {
      // Arrange
      const dto = plainToInstance(UpdateDocumentDto, {
        title: 'Updated Document',
        purpose: 'INVALID',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeDefined();
      expect(purposeError?.constraints?.isEnum).toContain(
        'purpose must be one of the following values',
      );
    });

    it('should not require purpose (optional field)', async () => {
      // Arrange - purpose not specified, only updating title
      const dto = plainToInstance(UpdateDocumentDto, {
        title: 'Updated Document',
      });

      // Act
      const errors = await validate(dto);

      // Assert - no validation errors related to purpose
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeUndefined();
    });

    it('should allow updating only purpose', async () => {
      // Arrange - only purpose specified (partial update)
      const dto = plainToInstance(UpdateDocumentDto, {
        purpose: 'INSTRUCTION',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should reject random string as purpose', async () => {
      // Arrange
      const dto = plainToInstance(UpdateDocumentDto, {
        purpose: 'NOT_A_PURPOSE',
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeDefined();
    });

    it('should reject numeric value as purpose', async () => {
      // Arrange
      const dto = plainToInstance(UpdateDocumentDto, {
        purpose: 123 as unknown as string,
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const purposeError = errors.find((e) => e.property === 'purpose');
      expect(purposeError).toBeDefined();
    });
  });
});
