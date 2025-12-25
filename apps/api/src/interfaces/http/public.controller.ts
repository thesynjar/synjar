import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PublicLinkService } from '@/application/public-link/public-link.service';
import {
  PublicSearchDto,
  PublicDocumentsResponseDto,
  PublicSearchResponseDto,
} from '../dto/public.dto';

@ApiTags('Public API')
@Controller('public')
@Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute for public API
export class PublicController {
  constructor(private readonly publicLinkService: PublicLinkService) {}

  @Get(':token/search')
  @ApiOperation({
    summary: 'Search documents via public link (GET)',
    description:
      'GET endpoint for semantic search - use this URL in LLMs for knowledge base access',
  })
  @ApiResponse({ status: 200, type: PublicSearchResponseDto })
  @ApiResponse({ status: 404, description: 'Invalid token' })
  @ApiResponse({ status: 403, description: 'Link expired or inactive' })
  async searchGet(
    @Param('token') token: string,
    @Query() query: PublicSearchDto,
  ) {
    return this.publicLinkService.searchPublic(token, query);
  }

  @Get(':token')
  @ApiOperation({ summary: 'Get available documents via public link' })
  @ApiResponse({ status: 200, type: PublicDocumentsResponseDto })
  @ApiResponse({ status: 404, description: 'Invalid token' })
  @ApiResponse({ status: 403, description: 'Link expired or inactive' })
  async getDocuments(
    @Param('token') token: string,
    @Query() query: PublicSearchDto,
  ) {
    return this.publicLinkService.getPublicDocuments(token, query);
  }

  @Post(':token/search')
  @ApiOperation({ summary: 'Search documents via public link' })
  @ApiResponse({ status: 200, type: PublicSearchResponseDto })
  async search(@Param('token') token: string, @Body() dto: PublicSearchDto) {
    return this.publicLinkService.searchPublic(token, dto);
  }
}
