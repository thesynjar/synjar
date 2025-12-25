import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { WorkspaceLookupService } from '@/application/workspace-lookup/workspace-lookup.service';
import {
  ResolveWorkspacesRequestDto,
  ResolveWorkspacesResponseDto,
} from './dto/resolve-workspaces.dto';

@ApiTags('Auth')
@Controller('auth')
export class WorkspaceLookupController {
  constructor(private readonly workspaceLookupService: WorkspaceLookupService) {}

  @Post('resolve-workspaces')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Resolve workspaces for user email',
    description:
      'PUBLIC endpoint (no auth required) that returns list of workspaces a user has access to based on their email. ' +
      'Used during login flow to determine which workspace(s) the user should authenticate against. ' +
      'Rate limited to 10 requests per minute.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully resolved workspaces',
    type: ResolveWorkspacesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email format',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - rate limit exceeded',
  })
  async resolveWorkspaces(
    @Body() dto: ResolveWorkspacesRequestDto,
  ): Promise<ResolveWorkspacesResponseDto> {
    const workspaces = await this.workspaceLookupService.resolveWorkspaces(dto.email);

    return { workspaces };
  }
}
