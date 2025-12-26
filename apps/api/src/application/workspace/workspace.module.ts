import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceLimitsService } from './workspace-limits.service';
import { WorkspaceController } from '../../interfaces/http/workspace.controller';
import { PrismaModule } from '../../infrastructure/persistence/prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { WORKSPACE_REPOSITORY } from '../../domain/workspace/workspace.repository';
import { PrismaWorkspaceRepository } from '../../infrastructure/persistence/repositories/workspace.repository.impl';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [WorkspaceController],
  providers: [
    WorkspaceService,
    WorkspaceLimitsService,
    {
      provide: WORKSPACE_REPOSITORY,
      useClass: PrismaWorkspaceRepository,
    },
  ],
  exports: [WorkspaceService, WorkspaceLimitsService, WORKSPACE_REPOSITORY],
})
export class WorkspaceModule {}
