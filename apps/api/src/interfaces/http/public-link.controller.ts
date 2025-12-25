import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/application/auth/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserData,
} from '@/application/auth/current-user.decorator';
import { PublicLinkService } from '@/application/public-link/public-link.service';
import {
  CreatePublicLinkDto,
  PublicLinkResponseDto,
} from '../dto/public-link.dto';

@ApiTags('Public Links')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/public-links')
export class PublicLinkController {
  constructor(private readonly publicLinkService: PublicLinkService) {}

  @Post()
  @ApiOperation({ summary: 'Create public link' })
  @ApiResponse({ status: 201, type: PublicLinkResponseDto })
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreatePublicLinkDto,
  ) {
    return this.publicLinkService.create(workspaceId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List public links' })
  @ApiResponse({ status: 200, type: [PublicLinkResponseDto] })
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.publicLinkService.findAll(workspaceId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public link by ID' })
  @ApiResponse({ status: 200, type: PublicLinkResponseDto })
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.publicLinkService.findOne(workspaceId, id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete public link' })
  @ApiResponse({ status: 204 })
  async delete(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.publicLinkService.delete(workspaceId, id, user.id);
  }
}
