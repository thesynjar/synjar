import { Injectable, Inject } from '@nestjs/common';
import { IChunkingStrategy, ChunkResult } from '../../../domain/document/chunking-strategy.port';
import { ILLMService, LLM_SERVICE } from '../../../domain/document/llm.port';

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
const SMALL_DOC_THRESHOLD = 1000; // tokens
const MEDIUM_DOC_THRESHOLD = 10000; // tokens

@Injectable()
export class HierarchicalStrategy implements IChunkingStrategy {
  readonly name = 'hierarchical';

  constructor(@Inject(LLM_SERVICE) private readonly llm: ILLMService) {}

  canHandle(tokenCount: number): boolean {
    return tokenCount >= 10000;
  }

  async chunk(content: string): Promise<ChunkResult[]> {
    // First split structurally, then LLM on each section
    const sections = this.splitByStructure(content);
    const allChunks: ChunkResult[] = [];

    for (const section of sections) {
      const sectionTokens = estimateTokens(section.content);

      if (sectionTokens < SMALL_DOC_THRESHOLD) {
        // Section is small enough
        allChunks.push({
          content: section.content,
          chunkType: section.type,
        });
      } else if (sectionTokens < MEDIUM_DOC_THRESHOLD) {
        // Use LLM for this section
        try {
          const chunks = await this.llm.smartChunk(section.content);
          allChunks.push(...chunks);
        } catch {
          const chunks = this.fixedSizeChunk(section.content);
          allChunks.push(...chunks);
        }
      } else {
        // Section is too large, use fixed-size
        const chunks = this.fixedSizeChunk(section.content);
        allChunks.push(...chunks);
      }
    }

    return allChunks;
  }

  private splitByStructure(text: string): Array<{ content: string; type: string }> {
    // Try splitting by markdown headers
    const headerRegex = /^(#{1,3})\s+(.+)$/gm;
    const matches = [...text.matchAll(headerRegex)];

    if (matches.length > 1) {
      const sections: Array<{ content: string; type: string }> = [];

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const nextMatch = matches[i + 1];

        const start = match.index!;
        const end = nextMatch ? nextMatch.index! : text.length;

        // Add content before first header as intro
        if (i === 0 && start > 0) {
          const intro = text.slice(0, start).trim();
          if (intro) {
            sections.push({ content: intro, type: 'introduction' });
          }
        }

        const sectionContent = text.slice(start, end).trim();
        const headerLevel = match[1].length;

        sections.push({
          content: sectionContent,
          type: headerLevel === 1 ? 'chapter' : headerLevel === 2 ? 'section' : 'subsection',
        });
      }

      return sections;
    }

    // Fallback: split by double newlines (paragraphs)
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

    if (paragraphs.length > 1) {
      return paragraphs.map((p) => ({ content: p.trim(), type: 'paragraph' }));
    }

    // No structure found, return as-is
    return [{ content: text, type: 'document' }];
  }

  private fixedSizeChunk(text: string): ChunkResult[] {
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
