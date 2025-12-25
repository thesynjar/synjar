export interface ParsedFile {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IFileParser {
  readonly supportedMimeTypes: string[];
  canParse(mimeType: string): boolean;
  parse(buffer: Buffer, filename?: string): Promise<ParsedFile>;
}

export const FILE_PARSERS = Symbol('FILE_PARSERS');
