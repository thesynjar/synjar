import { Module } from '@nestjs/common';
import { LLM_SERVICE } from '@/domain/document/llm.port';
import { OpenAILLMService } from './openai-llm.service';

@Module({
  providers: [
    {
      provide: LLM_SERVICE,
      useClass: OpenAILLMService,
    },
  ],
  exports: [LLM_SERVICE],
})
export class LLMModule {}
