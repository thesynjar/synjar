import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
  IsDateString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ContentType,
  VerificationStatus,
  ProcessingStatus,
} from '@prisma/client';

export class CreateDocumentDto {
  @ApiProperty({ example: 'My Document' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ example: 'Document content in markdown...' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'Email from client' })
  @IsOptional()
  @IsString()
  sourceDescription?: string;

  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({ type: [String], example: ['support', 'procedures'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((t: string) => t.trim());
    }
    return value;
  })
  tags?: string[];
}

export class UpdateDocumentDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'Display filename for FILE documents', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[^/\\]*$/, { message: 'Filename cannot contain path separators' })
  originalFilename?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceDescription?: string;

  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'For optimistic locking / conflict detection' })
  @IsOptional()
  @IsDateString()
  lastKnownUpdatedAt?: string;
}

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((t: string) => t.trim());
    }
    return value;
  })
  tags?: string[];

  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({ enum: ProcessingStatus })
  @IsOptional()
  @IsEnum(ProcessingStatus)
  processingStatus?: ProcessingStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TagDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class DocumentTagDto {
  @ApiProperty()
  documentId!: string;

  @ApiProperty()
  tagId!: string;

  @ApiProperty({ type: TagDto })
  tag!: TagDto;
}

export class ChunkSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  chunkIndex!: number;

  @ApiPropertyOptional()
  chunkType!: string | null;

  @ApiProperty()
  content!: string;
}

export class DocumentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ enum: ContentType })
  contentType!: ContentType;

  @ApiPropertyOptional()
  originalFilename!: string | null;

  @ApiPropertyOptional()
  fileUrl!: string | null;

  @ApiPropertyOptional()
  mimeType!: string | null;

  @ApiPropertyOptional()
  fileSize!: number | null;

  @ApiPropertyOptional()
  sourceDescription!: string | null;

  @ApiProperty({ enum: VerificationStatus })
  verificationStatus!: VerificationStatus;

  @ApiProperty({ enum: ProcessingStatus })
  processingStatus!: ProcessingStatus;

  @ApiPropertyOptional()
  processingError!: string | null;

  // Edit lock (SPEC-018)
  @ApiPropertyOptional({ description: 'User ID who holds the edit lock' })
  editLockedBy!: string | null;

  @ApiPropertyOptional({ description: 'When the edit lock expires' })
  editLockedUntil!: Date | null;

  // Deferred processing (SPEC-018)
  @ApiPropertyOptional({ description: 'When the document is scheduled for processing' })
  scheduledProcessingAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: [DocumentTagDto] })
  tags!: DocumentTagDto[];

  @ApiPropertyOptional({ type: [ChunkSummaryDto] })
  chunks?: ChunkSummaryDto[];
}

export class PaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class DocumentListResponseDto {
  @ApiProperty({ type: [DocumentResponseDto] })
  documents!: DocumentResponseDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

// Lock DTOs (SPEC-018)
export class LockResponseDto {
  @ApiProperty({ description: 'When the lock expires' })
  lockedUntil!: Date;
}

export class LockErrorResponseDto {
  @ApiProperty({ example: 'DOCUMENT_LOCKED' })
  error!: string;

  @ApiProperty({ description: 'Email of the user who holds the lock' })
  lockedBy!: string;

  @ApiProperty({ description: 'When the lock expires' })
  lockedUntil!: Date;
}

export class ConflictErrorResponseDto {
  @ApiProperty({ example: 'CONFLICT' })
  error!: string;

  @ApiProperty({ description: 'Server timestamp of the document' })
  serverUpdatedAt!: Date;

  @ApiProperty({ description: 'Error message' })
  message!: string;
}
