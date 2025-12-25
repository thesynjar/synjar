// Mock for file-type ESM module
export const fileTypeFromBuffer = async (
  _buffer: Uint8Array | ArrayBuffer,
): Promise<{ ext: string; mime: string } | undefined> => {
  // Mock implementation - returns undefined by default
  // Tests that need specific file type behavior can override this
  return undefined;
};

export const fileTypeFromFile = async (
  _filePath: string,
): Promise<{ ext: string; mime: string } | undefined> => {
  return undefined;
};

export const fileTypeFromStream = async (
  _stream: NodeJS.ReadableStream,
): Promise<{ ext: string; mime: string } | undefined> => {
  return undefined;
};
