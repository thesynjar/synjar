import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
  MaxLength,
  MinLength,
  ArrayMaxSize,
  IsDateString,
} from 'class-validator';

// ============ Request DTOs ============

export class CreateInstructionSetDto {
  @ApiProperty({
    example: 'Brand Voice Guidelines',
    description: 'Name of the instruction set',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    example: 'Official brand communication guidelines',
    description: 'Description of the instruction set',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['doc-uuid-1', 'doc-uuid-2'],
    description: 'Initial document IDs to add to the set',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(20)
  documentIds?: string[];
}

export class UpdateInstructionSetDto {
  @ApiPropertyOptional({
    example: 'Updated Name',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    example: 'Updated description',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Make the instruction set publicly accessible',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    example: '2025-12-30T12:00:00.000Z',
    description:
      'Expected updatedAt timestamp for optimistic locking. If provided and does not match current updatedAt, returns 409 Conflict.',
  })
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class AddDocumentDto {
  @ApiProperty({
    example: 'doc-uuid-123',
    description: 'ID of the document to add',
  })
  @IsUUID('4')
  documentId!: string;

  @ApiPropertyOptional({
    example: '2025-12-30T12:00:00.000Z',
    description:
      'Expected updatedAt timestamp for optimistic locking. If provided and does not match current updatedAt, returns 409 Conflict.',
  })
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class ReorderDocumentsDto {
  @ApiProperty({
    type: [String],
    example: ['doc-3', 'doc-1', 'doc-2'],
    description: 'Document IDs in the new order',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(20)
  documentIds!: string[];

  @ApiPropertyOptional({
    example: '2025-12-30T12:00:00.000Z',
    description:
      'Expected updatedAt timestamp for optimistic locking. If provided and does not match current updatedAt, returns 409 Conflict.',
  })
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class RemoveDocumentDto {
  @ApiPropertyOptional({
    example: '2025-12-30T12:00:00.000Z',
    description:
      'Expected updatedAt timestamp for optimistic locking. If provided and does not match current updatedAt, returns 409 Conflict.',
  })
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

// ============ Response DTOs ============

export class InstructionSetDocumentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() order!: number;
}

export class InstructionSetResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() isPublic!: boolean;
  @ApiPropertyOptional() publicUrl!: string | null;
  @ApiProperty() documentCount!: number;
  @ApiProperty() totalSizeBytes!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class InstructionSetDetailResponseDto extends InstructionSetResponseDto {
  @ApiProperty({ type: [InstructionSetDocumentResponseDto] })
  documents!: InstructionSetDocumentResponseDto[];

  @ApiProperty() tokenEstimate!: number;
  @ApiProperty({ enum: ['ok', 'warning', 'near_limit', 'exceeded'] })
  sizeStatus!: string;
}

export class InstructionSetListResponseDto {
  @ApiProperty({ type: [InstructionSetResponseDto] })
  data!: InstructionSetResponseDto[];

  @ApiProperty()
  meta!: {
    count: number;
    limit: number;
    remaining: number;
  };
}

export class AddDocumentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() order!: number;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ description: 'Updated timestamp of the instruction set after operation' })
  updatedAt!: Date;
}

export class ReorderDocumentsResponseDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        documentId: { type: 'string' },
        order: { type: 'number' },
      },
    },
  })
  documents!: { documentId: string; order: number }[];

  @ApiProperty({ description: 'Updated timestamp of the instruction set after operation' })
  updatedAt!: Date;
}

// ============ Public Response DTOs ============

export class PublicDocumentDto {
  @ApiProperty() title!: string;
  @ApiProperty() content!: string;
  @ApiPropertyOptional() sourceUrl!: string | null;
  @ApiProperty() order!: number;
}

export class PublicSetContentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty({ type: [PublicDocumentDto] })
  documents!: PublicDocumentDto[];
  @ApiProperty({ description: 'Combined content of all documents' })
  content!: string;
  @ApiProperty() totalSizeBytes!: number;
  @ApiProperty() tokenEstimate!: number;
  @ApiProperty() updatedAt!: Date;
}

// ============ Error Response DTOs ============

export class ErrorDetailDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional() details?: Record<string, unknown>;
  @ApiPropertyOptional() suggestion?: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto })
  error!: ErrorDetailDto;
}
