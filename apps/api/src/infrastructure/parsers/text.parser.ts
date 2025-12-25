import { Injectable } from '@nestjs/common';
import { IFileParser, ParsedFile } from '../../domain/document/file-parser.port';

@Injectable()
export class TextParser implements IFileParser {
  readonly supportedMimeTypes = ['text/plain', 'text/markdown'];

  canParse(mimeType: string): boolean {
    return this.supportedMimeTypes.includes(mimeType);
  }

  async parse(buffer: Buffer): Promise<ParsedFile> {
    return {
      content: buffer.toString('utf-8'),
    };
  }
}
