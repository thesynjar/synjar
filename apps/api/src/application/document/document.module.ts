import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentProcessorService } from './document-processor.service';
import { FileValidatorService } from './file-validator.service';
import { DocumentController } from '../../interfaces/http/document.controller';
import { WorkspaceModule } from '../workspace/workspace.module';
import { ChunkingModule } from '../chunking/chunking.module';
import { EmbeddingsModule } from '../../infrastructure/embeddings/embeddings.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { DOCUMENT_REPOSITORY } from '../../domain/document/document.repository';
import { PrismaDocumentRepository } from '../../infrastructure/persistence/repositories/document.repository.impl';
import { PrismaModule } from '../../infrastructure/persistence/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    WorkspaceModule,
    ChunkingModule,
    EmbeddingsModule,
    StorageModule,
  ],
  controllers: [DocumentController],
  providers: [
    DocumentService,
    DocumentProcessorService,
    FileValidatorService,
    {
      provide: DOCUMENT_REPOSITORY,
      useClass: PrismaDocumentRepository,
    },
  ],
  exports: [DocumentService, DOCUMENT_REPOSITORY],
})
export class DocumentModule {}
