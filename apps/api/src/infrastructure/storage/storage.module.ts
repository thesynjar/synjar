import { Module } from '@nestjs/common';
import { STORAGE_SERVICE } from '@/domain/document/storage.port';
import { BackblazeStorageService } from './backblaze.service';

@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: BackblazeStorageService,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
