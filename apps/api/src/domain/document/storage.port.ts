export interface UploadResult {
  url: string;
  key: string;
  size: number;
}

export interface IStorageService {
  upload(
    file: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<UploadResult>;

  delete(key: string): Promise<void>;

  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
