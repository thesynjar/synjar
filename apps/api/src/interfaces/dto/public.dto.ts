import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { VerificationStatus } from '@prisma/client';

export class PublicSearchDto {
  @ApiPropertyOptional({ example: 'How to handle complaints?' })
  @IsOptional()
  @IsString()
  query?: string;

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

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PublicDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ enum: VerificationStatus })
  verificationStatus!: VerificationStatus;

  @ApiPropertyOptional({
    description: 'Pre-signed URL to original file (valid for 1 hour). Null if document is text-only.',
    example: 'https://bucket.s3.amazonaws.com/uuid-file.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&...',
    nullable: true,
  })
  fileUrl!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PublicDocumentsResponseDto {
  @ApiProperty()
  workspace!: string;

  @ApiProperty({ type: [PublicDocumentDto] })
  documents!: PublicDocumentDto[];

  @ApiProperty()
  totalCount!: number;
}

export class PublicSearchResultDto {
  @ApiProperty()
  documentId!: string;

  @ApiProperty()
  chunkId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  score!: number;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiPropertyOptional({
    description: 'Pre-signed URL to original file (valid for 1 hour). Null if document is text-only.',
    example: 'https://bucket.s3.amazonaws.com/uuid-file.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&...',
    nullable: true,
  })
  fileUrl!: string | null;
}

export class PublicSearchResponseDto {
  @ApiProperty()
  workspace!: string;

  @ApiProperty({ type: [PublicSearchResultDto] })
  results!: PublicSearchResultDto[];

  @ApiProperty()
  totalCount!: number;
}
