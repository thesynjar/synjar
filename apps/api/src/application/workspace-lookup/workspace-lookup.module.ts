import { Module } from '@nestjs/common';
import { WorkspaceLookupService } from './workspace-lookup.service';
import { WorkspaceLookupListener } from './workspace-lookup.listener';
import { WorkspaceLookupController } from '../../interfaces/http/workspace-lookup/workspace-lookup.controller';

@Module({
  controllers: [WorkspaceLookupController],
  providers: [WorkspaceLookupService, WorkspaceLookupListener],
  exports: [WorkspaceLookupService],
})
export class WorkspaceLookupModule {}
