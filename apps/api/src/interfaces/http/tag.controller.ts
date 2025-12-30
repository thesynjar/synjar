import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/application/auth/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserData,
} from '@/application/auth/current-user.decorator';
import { TagService } from '@/application/tag/tag.service';
import {
  TagResponseDto,
  TagWithCountResponseDto,
  TagSuggestionResponseDto,
  CreateTagDto,
  UpdateTagDto,
  TagStatsResponseDto,
} from '../dto/tag.dto';

@ApiTags('Tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('workspaces/:workspaceId/tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  @ApiOperation({ summary: 'List all tags in workspace' })
  @ApiResponse({ status: 200, type: [TagWithCountResponseDto] })
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<TagWithCountResponseDto[]> {
    return this.tagService.findAll(workspaceId, user.id);
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Autocomplete search for tags' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiResponse({ status: 200, type: [TagSuggestionResponseDto] })
  async autocomplete(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
    @Query('q') query?: string,
  ): Promise<TagSuggestionResponseDto[]> {
    return this.tagService.autocomplete(workspaceId, user.id, query || '');
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get tag usage statistics' })
  @ApiResponse({ status: 200, type: TagStatsResponseDto })
  async getStats(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<TagStatsResponseDto> {
    return this.tagService.getStats(workspaceId, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiResponse({ status: 201, type: TagResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid tag name or limit reached' })
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateTagDto,
  ): Promise<TagResponseDto> {
    return this.tagService.create(workspaceId, user.id, dto);
  }

  @Patch(':tagId')
  @ApiOperation({ summary: 'Rename a tag' })
  @ApiResponse({ status: 200, type: TagResponseDto })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @ApiResponse({ status: 400, description: 'Invalid tag name' })
  async rename(
    @Param('workspaceId') workspaceId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateTagDto,
  ): Promise<TagResponseDto> {
    return this.tagService.rename(workspaceId, user.id, tagId, dto);
  }

  @Delete(':tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiResponse({ status: 204, description: 'Tag deleted' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async delete(
    @Param('workspaceId') workspaceId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<void> {
    await this.tagService.delete(workspaceId, user.id, tagId);
  }
}
