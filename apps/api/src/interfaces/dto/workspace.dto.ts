import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'My Knowledge Base' })
  @IsString()
  name!: string;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ example: 'Updated Name' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class AddMemberDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ enum: Role, default: Role.MEMBER })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UserSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  name!: string | null;
}

export class MemberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: UserSummaryDto })
  user!: UserSummaryDto;
}

export class WorkspaceCountsDto {
  @ApiProperty()
  documents!: number;

  @ApiPropertyOptional()
  publicLinks?: number;
}

export class WorkspaceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: [MemberResponseDto] })
  members!: MemberResponseDto[];

  @ApiPropertyOptional({ type: WorkspaceCountsDto })
  _count?: WorkspaceCountsDto;
}
