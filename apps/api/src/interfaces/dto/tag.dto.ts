import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({
    description: 'Tag name (will be normalized to lowercase alphanumeric with hyphens)',
    example: 'support',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name!: string;
}

export class UpdateTagDto {
  @ApiProperty({
    description: 'New tag name (will be normalized)',
    example: 'customer-support',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name!: string;
}

export class TagResponseDto {
  @ApiProperty({ description: 'Tag ID', example: 'uuid-here' })
  id!: string;

  @ApiProperty({ description: 'Tag name', example: 'support' })
  name!: string;

  @ApiProperty({ description: 'Workspace ID', example: 'workspace-uuid' })
  workspaceId!: string;

  @ApiProperty({ description: 'Creation timestamp', example: '2025-12-30T12:00:00.000Z' })
  createdAt!: string;
}

export class TagWithCountResponseDto extends TagResponseDto {
  @ApiProperty({ description: 'Number of documents with this tag', example: 15 })
  documentCount!: number;
}

export class TagSuggestionResponseDto {
  @ApiProperty({ description: 'Tag ID', example: 'uuid-here' })
  id!: string;

  @ApiProperty({ description: 'Tag name', example: 'support' })
  name!: string;

  @ApiProperty({ description: 'Number of documents with this tag', example: 15 })
  documentCount!: number;
}

export class TagStatsResponseDto {
  @ApiProperty({ description: 'Total number of tags in workspace', example: 25 })
  totalTags!: number;

  @ApiProperty({ description: 'Number of tags with no documents', example: 3 })
  orphanTags!: number;

  @ApiProperty({ description: 'Most used tags', type: [TagSuggestionResponseDto] })
  mostUsed!: TagSuggestionResponseDto[];
}
