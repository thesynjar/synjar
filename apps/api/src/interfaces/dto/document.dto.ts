import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
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
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

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
