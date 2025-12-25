import { Injectable } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import { IFileParser, ParsedFile } from '../../domain/document/file-parser.port';

@Injectable()
export class PdfParser implements IFileParser {
  readonly supportedMimeTypes = ['application/pdf'];

  canParse(mimeType: string): boolean {
    return this.supportedMimeTypes.includes(mimeType);
  }

  async parse(buffer: Buffer): Promise<ParsedFile> {
    const data = await pdfParse(buffer);
    return {
      content: data.text,
      metadata: {
        pages: data.numpages,
        info: data.info,
      },
    };
  }
}
