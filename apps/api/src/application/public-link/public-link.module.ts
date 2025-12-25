import { Module } from '@nestjs/common';
import { PublicLinkService } from './public-link.service';
import { PublicLinkController } from '../../interfaces/http/public-link.controller';
import { PublicController } from '../../interfaces/http/public.controller';
import { WorkspaceModule } from '../workspace/workspace.module';
import { EmbeddingsModule } from '../../infrastructure/embeddings/embeddings.module';
import { PrismaModule } from '../../infrastructure/persistence/prisma/prisma.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { PUBLIC_LINK_REPOSITORY } from '../../domain/public-link/public-link.repository';
import { PrismaPublicLinkRepository } from '../../infrastructure/persistence/repositories/public-link.repository.impl';

@Module({
  imports: [WorkspaceModule, EmbeddingsModule, PrismaModule, StorageModule],
  controllers: [PublicLinkController, PublicController],
  providers: [
    PublicLinkService,
    {
      provide: PUBLIC_LINK_REPOSITORY,
      useClass: PrismaPublicLinkRepository,
    },
  ],
  exports: [PublicLinkService, PUBLIC_LINK_REPOSITORY],
})
export class PublicLinkModule {}
