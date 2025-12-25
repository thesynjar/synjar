import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import { IFileParser, ParsedFile } from '../../domain/document/file-parser.port';

@Injectable()
export class DocxParser implements IFileParser {
  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  canParse(mimeType: string): boolean {
    return this.supportedMimeTypes.includes(mimeType);
  }

  async parse(buffer: Buffer): Promise<ParsedFile> {
    const result = await mammoth.extractRawText({ buffer });
    return {
      content: result.value,
      metadata: {
        messages: result.messages,
      },
    };
  }
}
