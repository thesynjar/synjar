import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { VerificationStatus } from '@prisma/client';

export class SearchDto {
  @ApiProperty({ example: 'How to handle complaints?' })
  @IsString()
  query!: string;

  @ApiPropertyOptional({ type: [String], example: ['support', 'procedures'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeUnverified?: boolean;
}

export class SearchResultDto {
  @ApiProperty()
  documentId!: string;

  @ApiProperty()
  chunkId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ description: 'Similarity score (0-1)' })
  score!: number;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ enum: VerificationStatus })
  verificationStatus!: VerificationStatus;

  @ApiPropertyOptional()
  fileUrl!: string | null;
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultDto] })
  results!: SearchResultDto[];

  @ApiProperty()
  totalCount!: number;
}
