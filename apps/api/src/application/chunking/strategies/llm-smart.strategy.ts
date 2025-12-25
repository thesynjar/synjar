import { Injectable, Inject, Logger } from '@nestjs/common';
import { IChunkingStrategy, ChunkResult } from '../../../domain/document/chunking-strategy.port';
import { ILLMService, LLM_SERVICE } from '../../../domain/document/llm.port';

@Injectable()
export class LlmSmartStrategy implements IChunkingStrategy {
  private readonly logger = new Logger(LlmSmartStrategy.name);
  readonly name = 'llm-smart';

  constructor(@Inject(LLM_SERVICE) private readonly llm: ILLMService) {}

  canHandle(tokenCount: number): boolean {
    return tokenCount >= 1000 && tokenCount < 10000;
  }

  async chunk(content: string): Promise<ChunkResult[]> {
    try {
      const result = await this.llm.smartChunk(content);
      return result;
    } catch (error) {
      this.logger.warn('LLM chunking failed, falling back to fixed-size:', error instanceof Error ? error.stack : error);
      return this.fallbackFixedSizeChunk(content);
    }
  }

  private fallbackFixedSizeChunk(text: string): ChunkResult[] {
    const FIXED_CHUNK_SIZE = 512; // tokens
    const FIXED_CHUNK_OVERLAP = 64; // tokens
    const chunks: ChunkResult[] = [];
    const charsPerChunk = FIXED_CHUNK_SIZE * 4;
    const overlapChars = FIXED_CHUNK_OVERLAP * 4;

    let start = 0;
    let chunkIndex = 0;

    while (start < text.length) {
      let end = Math.min(start + charsPerChunk, text.length);

      // Try to break at sentence boundary
      if (end < text.length) {
        const searchStart = Math.max(end - 200, start);
        const segment = text.slice(searchStart, end + 100);
        const sentenceEnd = segment.search(/[.!?]\s+/);

        if (sentenceEnd !== -1) {
          end = searchStart + sentenceEnd + 1;
        }
      }

      chunks.push({
        content: text.slice(start, end).trim(),
        chunkType: 'fixed-chunk',
        metadata: { summary: `Chunk ${chunkIndex + 1}` },
      });

      start = end - overlapChars;
      chunkIndex++;

      // Prevent infinite loop
      if (start >= text.length - overlapChars) break;
    }

    return chunks;
  }
}
