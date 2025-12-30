import { Module } from '@nestjs/common';
import { TagService } from './tag.service';
import { TagController } from '../../interfaces/http/tag.controller';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [WorkspaceModule],
  controllers: [TagController],
  providers: [TagService],
  exports: [TagService],
})
export class TagModule {}
