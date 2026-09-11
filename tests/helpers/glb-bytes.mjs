import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

export async function readGLBBytes(path) {
  const bytes = await readFile(path);
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
}
