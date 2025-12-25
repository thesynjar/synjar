import { ChunkResult } from './chunking-strategy.port';

export { ChunkResult };

export interface ILLMService {
  smartChunk(text: string): Promise<ChunkResult[]>;

  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

export const LLM_SERVICE = Symbol('LLM_SERVICE');
