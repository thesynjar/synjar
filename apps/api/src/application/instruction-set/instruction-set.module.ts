import { Module } from '@nestjs/common';
import { InstructionSetService } from './instruction-set.service';
import { InstructionSetController } from '../../interfaces/http/instruction-set.controller';
import { PublicInstructionSetController } from '../../interfaces/http/public-instruction-set.controller';
import { WorkspaceModule } from '../workspace/workspace.module';
import { INSTRUCTION_SET_REPOSITORY } from '../../domain/instruction-set/instruction-set.repository';
import { PrismaInstructionSetRepository } from '../../infrastructure/persistence/repositories/instruction-set.repository.impl';
import { PrismaModule } from '../../infrastructure/persistence/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    WorkspaceModule,
  ],
  controllers: [InstructionSetController, PublicInstructionSetController],
  providers: [
    InstructionSetService,
    {
      provide: INSTRUCTION_SET_REPOSITORY,
      useClass: PrismaInstructionSetRepository,
    },
  ],
  exports: [InstructionSetService, INSTRUCTION_SET_REPOSITORY],
})
export class InstructionSetModule {}
