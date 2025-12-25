import { Injectable, BadRequestException } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';

interface AllowedMimeType {
  mime: string;
  extensions: string[];
}

@Injectable()
export class FileValidatorService {
  private readonly allowedTypes: AllowedMimeType[] = [
    { mime: 'application/pdf', extensions: ['pdf'] },
    {
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extensions: ['docx'],
    },
    { mime: 'text/plain', extensions: ['txt'] },
    { mime: 'text/markdown', extensions: ['md'] },
  ];

  async validateFile(
    buffer: Buffer,
    declaredMimeType: string,
    filename: string,
  ): Promise<void> {
    // Text files don't have magic bytes, validate by extension
    if (this.isTextFile(filename)) {
      if (!this.isAllowedTextExtension(filename)) {
        throw new BadRequestException(
          `File extension not allowed: ${filename}`,
        );
      }
      return;
    }

    // For binary files, check magic bytes
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected) {
      throw new BadRequestException(
        'Could not determine file type from content',
      );
    }

    // Verify detected type matches declared type
    if (detected.mime !== declaredMimeType) {
      throw new BadRequestException(
        `File content (${detected.mime}) does not match declared type (${declaredMimeType})`,
      );
    }

    // Verify type is allowed
    if (!this.isAllowedMimeType(detected.mime)) {
      throw new BadRequestException(
        `File type not allowed: ${detected.mime}`,
      );
    }
  }

  private isTextFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext === 'txt' || ext === 'md';
  }

  private isAllowedTextExtension(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext === 'txt' || ext === 'md';
  }

  private isAllowedMimeType(mime: string): boolean {
    return this.allowedTypes.some((t) => t.mime === mime);
  }
}
