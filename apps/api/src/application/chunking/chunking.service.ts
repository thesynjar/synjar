import { Injectable, Inject } from '@nestjs/common';
import { IChunkingStrategy, CHUNKING_STRATEGIES, ChunkResult } from '@/domain/document/chunking-strategy.port';
import { IFileParser, FILE_PARSERS } from '@/domain/document/file-parser.port';

// Approximate token count (rough estimate: 1 token ~ 4 chars)
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

@Injectable()
export class ChunkingService {
  constructor(
    @Inject(CHUNKING_STRATEGIES)
    private readonly strategies: IChunkingStrategy[],
    @Inject(FILE_PARSERS) private readonly fileParsers: IFileParser[],
  ) {}

  async parseFile(buffer: Buffer, mimeType: string): Promise<string> {
    const parser = this.fileParsers.find((p) => p.canParse(mimeType));

    if (!parser) {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    const result = await parser.parse(buffer);
    return result.content;
  }

  async chunk(text: string): Promise<ChunkResult[]> {
    const tokenCount = estimateTokens(text);

    const strategy = this.strategies.find((s) => s.canHandle(tokenCount, text));
    if (!strategy) {
      throw new Error(`No chunking strategy found for token count: ${tokenCount}`);
    }

    return strategy.chunk(text);
  }
}
