import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from '../../interfaces/http/search.controller';
import { WorkspaceModule } from '../workspace/workspace.module';
import { EmbeddingsModule } from '../../infrastructure/embeddings/embeddings.module';
import { PrismaModule } from '../../infrastructure/persistence/prisma/prisma.module';
import { SEARCH_REPOSITORY } from '../../domain/search/search.repository';
import { PrismaSearchRepository } from '../../infrastructure/persistence/repositories/search.repository.impl';

@Module({
  imports: [WorkspaceModule, EmbeddingsModule, PrismaModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    {
      provide: SEARCH_REPOSITORY,
      useClass: PrismaSearchRepository,
    },
  ],
  exports: [SearchService],
})
export class SearchModule {}
