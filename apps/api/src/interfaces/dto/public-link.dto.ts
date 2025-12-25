import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, ValidateIf, IsDate } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreatePublicLinkDto {
  @ApiPropertyOptional({ example: 'Support Team Link' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: [String], example: ['support', 'faq'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTags?: string[];

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z' })
  @IsOptional()
  @ValidateIf((o) => o.expiresAt !== undefined && o.expiresAt !== null)
  @Type(() => Date)
  @IsDate({ message: 'expiresAt must be a valid date' })
  @Transform(({ value }) => {
    if (!value) return value;
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error('expiresAt must be a valid date');
    }
    if (date <= new Date()) {
      throw new Error('expiresAt must be in the future');
    }
    return date;
  })
  expiresAt?: Date;
}

export class PublicLinkResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  token!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiPropertyOptional()
  name!: string | null;

  @ApiProperty({ type: [String] })
  allowedTags!: string[];

  @ApiPropertyOptional()
  expiresAt!: Date | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;
}
