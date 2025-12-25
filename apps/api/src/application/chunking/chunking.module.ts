import { Module } from '@nestjs/common';
import { ChunkingService } from './chunking.service';
import { NoSplitStrategy } from './strategies/no-split.strategy';
import { LlmSmartStrategy } from './strategies/llm-smart.strategy';
import { HierarchicalStrategy } from './strategies/hierarchical.strategy';
import { CHUNKING_STRATEGIES } from '../../domain/document/chunking-strategy.port';
import { LLMModule } from '../../infrastructure/llm/llm.module';
import { ParsersModule } from '../../infrastructure/parsers/parsers.module';

@Module({
  imports: [LLMModule, ParsersModule],
  providers: [
    ChunkingService,
    NoSplitStrategy,
    LlmSmartStrategy,
    HierarchicalStrategy,
    {
      provide: CHUNKING_STRATEGIES,
      useFactory: (noSplit, llmSmart, hierarchical) => [noSplit, llmSmart, hierarchical],
      inject: [NoSplitStrategy, LlmSmartStrategy, HierarchicalStrategy],
    },
  ],
  exports: [ChunkingService],
})
export class ChunkingModule {}
