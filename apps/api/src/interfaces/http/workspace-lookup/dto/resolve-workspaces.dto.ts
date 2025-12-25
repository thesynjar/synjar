import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ResolveWorkspacesRequestDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address to lookup workspaces for',
  })
  @IsEmail()
  email!: string;
}

export class WorkspaceInfoDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Workspace ID',
  })
  id!: string;

  @ApiProperty({
    example: 'My Workspace',
    description: 'Workspace name',
  })
  name!: string;
}

export class ResolveWorkspacesResponseDto {
  @ApiProperty({
    type: [WorkspaceInfoDto],
    description: 'List of workspaces the user has access to',
  })
  workspaces!: WorkspaceInfoDto[];
}
