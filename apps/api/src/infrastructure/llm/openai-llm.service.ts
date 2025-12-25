import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ILLMService, ChunkResult } from '@/domain/document/llm.port';

const CHUNKING_SYSTEM_PROMPT = `You are a document chunking assistant. Your task is to split the given text into semantically coherent chunks suitable for RAG retrieval.

Rules:
1. Each chunk should be self-contained and make sense on its own
2. Keep related information together
3. Target chunk size: 200-500 tokens
4. Preserve important context (who, what, when, where)
5. Return valid JSON only

Output format:
{
  "chunks": [
    {
      "content": "...",
      "type": "introduction|definition|procedure|example|conclusion|other",
      "summary": "one-line summary for indexing"
    }
  ]
}`;

interface LLMChunkResponse {
  content: string;
  type: string;
  summary: string;
}

interface LLMChunksResult {
  chunks: LLMChunkResponse[];
}

@Injectable()
export class OpenAILLMService implements ILLMService {
  private readonly client: OpenAI;
  private readonly model = 'gpt-4o-mini';

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow('OPENAI_API_KEY'),
      organization: this.configService.get('OPENAI_ORG_ID'),
    });
  }

  async smartChunk(text: string): Promise<ChunkResult[]> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: CHUNKING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Split this text into semantic chunks:\n\n${text}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    try {
      const parsed: LLMChunksResult = JSON.parse(content);
      const chunks = parsed.chunks || [];
      // Map from LLM response format to ChunkResult format
      return chunks.map((chunk: LLMChunkResponse) => ({
        content: chunk.content,
        chunkType: chunk.type,
        metadata: { summary: chunk.summary },
      }));
    } catch {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || '';
  }
}
