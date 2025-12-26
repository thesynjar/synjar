import {
  Controller,
  Get,
  Post,
  Put,
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
import { WorkspaceService } from '@/application/workspace/workspace.service';
import { WorkspaceLimitsService } from '@/application/workspace/workspace-limits.service';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  AddMemberDto,
  WorkspaceResponseDto,
  MemberResponseDto,
  InviteMemberDto,
  InvitationResponseDto,
} from '../dto/workspace.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspaceController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly limitsService: WorkspaceLimitsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create workspace' })
  @ApiResponse({ status: 201, type: WorkspaceResponseDto })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspaceService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List user workspaces' })
  @ApiResponse({ status: 200, type: [WorkspaceResponseDto] })
  async findAll(@CurrentUser() user: CurrentUserData) {
    return this.workspaceService.findAllForUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace by ID' })
  @ApiResponse({ status: 200, type: WorkspaceResponseDto })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workspaceService.findOne(id, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update workspace' })
  @ApiResponse({ status: 200, type: WorkspaceResponseDto })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspaceService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workspace' })
  @ApiResponse({ status: 204 })
  async delete(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    await this.workspaceService.delete(id, user.id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add member to workspace' })
  @ApiResponse({ status: 201, type: MemberResponseDto })
  async addMember(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AddMemberDto,
  ) {
    return this.workspaceService.addMember(id, user.id, dto);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List workspace members' })
  @ApiResponse({ status: 200, type: [MemberResponseDto] })
  async getMembers(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workspaceService.getMembers(id, user.id);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove member from workspace' })
  @ApiResponse({ status: 204 })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.workspaceService.removeMember(id, user.id, userId);
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Get workspace usage statistics' })
  @ApiResponse({ status: 200 })
  async getUsage(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.workspaceService.ensureMember(id, user.id);
    return this.limitsService.getUsageStats(id);
  }

  @Post(':id/invite')
  @ApiOperation({ summary: 'Invite user to workspace' })
  @ApiResponse({ status: 201, type: InvitationResponseDto })
  @ApiResponse({ status: 403, description: 'Only owners and admins can invite members' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async inviteMember(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: InviteMemberDto,
  ) {
    return this.workspaceService.inviteMember(id, user.id, dto);
  }
}
