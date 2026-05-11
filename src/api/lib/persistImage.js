import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export default async function persistImage({ bytes, contentHash, mimeType }) {
  const dir = process.env.YTAI_IMAGE_DIR || './data/images';
  await mkdir(dir, { recursive: true });
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
  const filename = `${contentHash}.${ext}`;
  const fullPath = path.join(dir, filename);
  if (!existsSync(fullPath)) {
    await writeFile(fullPath, bytes);
  }
  return { storageUrl: `file://${path.resolve(fullPath)}`, localPath: fullPath };
}
