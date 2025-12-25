import { Module } from '@nestjs/common';
import { PdfParser } from './pdf.parser';
import { DocxParser } from './docx.parser';
import { TextParser } from './text.parser';
import { FILE_PARSERS } from '../../domain/document/file-parser.port';

@Module({
  providers: [
    PdfParser,
    DocxParser,
    TextParser,
    {
      provide: FILE_PARSERS,
      useFactory: (pdf, docx, text) => [pdf, docx, text],
      inject: [PdfParser, DocxParser, TextParser],
    },
  ],
  exports: [FILE_PARSERS],
})
export class ParsersModule {}
