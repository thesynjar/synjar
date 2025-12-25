import { Module } from '@nestjs/common';
import { EMBEDDINGS_SERVICE } from '@/domain/document/embeddings.port';
import { OpenAIEmbeddingsService } from './openai-embeddings.service';

@Module({
  providers: [
    {
      provide: EMBEDDINGS_SERVICE,
      useClass: OpenAIEmbeddingsService,
    },
  ],
  exports: [EMBEDDINGS_SERVICE],
})
export class EmbeddingsModule {}
