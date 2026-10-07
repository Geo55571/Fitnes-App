import { File } from 'expo-file-system';

/** Reads a bundled asset (already downloaded to a local file URI) as bytes. */
export async function readAssetBytes(uri: string): Promise<ArrayBuffer> {
  const bytes = await new File(uri).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
