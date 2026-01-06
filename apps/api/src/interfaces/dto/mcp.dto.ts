import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, Min, Max, IsOptional, IsArray } from 'class-validator';

export class McpInitializeRequestDto {
  @ApiProperty({ example: '2.0', enum: ['2.0'] })
  jsonrpc!: '2.0';

  @ApiProperty({ example: 'init-1' })
  id!: string | number;

  @ApiProperty({ example: 'initialize', enum: ['initialize'] })
  method!: 'initialize';

  @ApiPropertyOptional({
    description: 'Client capabilities and info',
    example: {
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'ChatGPT', version: '1.0' }
    }
  })
  params?: {
    protocolVersion: string;
    capabilities?: Record<string, unknown>;
    clientInfo?: { name: string; version: string };
  };
}

export class McpSearchArgumentsDto {
  @ApiProperty({
    example: 'refund policy',
    description: 'Search query',
    minLength: 2,
    maxLength: 256
  })
  @IsString()
  query!: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Maximum number of results',
    minimum: 1,
    maximum: 20
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  limit?: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['docs', 'faq'],
    description: 'Filter by document tags'
  })
  @IsArray()
  @IsOptional()
  tags?: string[];
}

export class McpToolsCallRequestDto {
  @ApiProperty({ example: '2.0', enum: ['2.0'] })
  jsonrpc!: '2.0';

  @ApiProperty({ example: 'call-1' })
  id!: string | number;

  @ApiProperty({ example: 'tools/call', enum: ['tools/call'] })
  method!: 'tools/call';

  @ApiProperty({
    description: 'Tool call parameters',
    example: {
      name: 'synjar_search',
      arguments: { query: 'refund policy', limit: 5 }
    }
  })
  params!: {
    name: string;
    arguments: Record<string, unknown>;
  };
}
