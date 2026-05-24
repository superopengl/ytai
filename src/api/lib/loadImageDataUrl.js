import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getObjectBytes } from './s3.js';

// Re-hydrate an image we previously persisted so vision lookups on later
// turns can run without the client resending the bytes. Supports both
// file:// (dev) and s3:// (prod). Returns null when the bytes can't be
// fetched so the caller can log and degrade.
export default async function loadImageDataUrl(storageUrl) {
  if (typeof storageUrl !== 'string' || storageUrl.length === 0) return null;

  if (storageUrl.startsWith('file://')) {
    const filePath = fileURLToPath(storageUrl);
    const bytes = await readFile(filePath);
    const mime = mimeFromPath(filePath);
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }

  if (storageUrl.startsWith('s3://')) {
    const obj = await getObjectBytes(storageUrl);
    if (!obj) return null;
    const mime = obj.contentType?.startsWith('image/')
      ? obj.contentType
      : mimeFromPath(storageUrl);
    return `data:${mime};base64,${obj.bytes.toString('base64')}`;
  }

  return null;
}

function mimeFromPath(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}
