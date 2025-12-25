export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export interface IEmbeddingsService {
  generateEmbedding(text: string): Promise<EmbeddingResult>;
  generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]>;
}

export const EMBEDDINGS_SERVICE = Symbol('EMBEDDINGS_SERVICE');
