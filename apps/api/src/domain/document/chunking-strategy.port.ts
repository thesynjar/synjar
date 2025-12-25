export interface ChunkResult {
  content: string;
  chunkType?: string;
  metadata?: Record<string, unknown>;
}

export interface IChunkingStrategy {
  readonly name: string;
  canHandle(tokenCount: number, content: string): boolean;
  chunk(content: string): Promise<ChunkResult[]>;
}

export const CHUNKING_STRATEGIES = Symbol('CHUNKING_STRATEGIES');
