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
