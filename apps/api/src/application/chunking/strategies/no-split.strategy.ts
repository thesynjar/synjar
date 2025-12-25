import { Injectable } from '@nestjs/common';
import { IChunkingStrategy, ChunkResult } from '../../../domain/document/chunking-strategy.port';

@Injectable()
export class NoSplitStrategy implements IChunkingStrategy {
  readonly name = 'no-split';

  canHandle(tokenCount: number): boolean {
    return tokenCount < 1000;
  }

  async chunk(content: string): Promise<ChunkResult[]> {
    return [{ content, chunkType: 'full-document' }];
  }
}
