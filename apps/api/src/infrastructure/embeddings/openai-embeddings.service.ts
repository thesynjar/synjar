import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  IEmbeddingsService,
  EmbeddingResult,
} from '@/domain/document/embeddings.port';

@Injectable()
export class OpenAIEmbeddingsService implements IEmbeddingsService {
  private readonly client: OpenAI;
  private readonly model = 'text-embedding-3-small';

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow('OPENAI_API_KEY'),
      organization: this.configService.get('OPENAI_ORG_ID'),
    });
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!text || !text.trim()) {
      throw new Error('Cannot generate embedding for empty text');
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });

    return {
      embedding: response.data[0].embedding,
      tokenCount: response.usage.total_tokens,
    };
  }

  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      throw new Error('Cannot generate embeddings for empty texts array');
    }

    // Validate all texts are non-empty
    const emptyIndices = texts
      .map((t, i) => (!t || !t.trim() ? i : -1))
      .filter((i) => i !== -1);
    if (emptyIndices.length > 0) {
      throw new Error(
        `Cannot generate embeddings for empty texts at indices: ${emptyIndices.join(', ')}`,
      );
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });

    const tokensPerText = Math.ceil(response.usage.total_tokens / texts.length);

    return response.data.map((item) => ({
      embedding: item.embedding,
      tokenCount: tokensPerText,
    }));
  }
}
