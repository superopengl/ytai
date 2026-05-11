import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Re-hydrate an image we previously persisted on disk so vision lookups on
// later turns can run without the client resending the bytes. Only supports
// the local file:// scheme persistImage produces today; once S3 storage is
// wired in, extend this with an s3:// branch.
export default async function loadImageDataUrl(storageUrl) {
  if (typeof storageUrl !== 'string' || storageUrl.length === 0) return null;

  if (storageUrl.startsWith('file://')) {
    const filePath = fileURLToPath(storageUrl);
    const bytes = await readFile(filePath);
    const mime = mimeFromPath(filePath);
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }

  // Other schemes (s3://, https://) aren't supported yet — bail out so the
  // caller can log and degrade gracefully.
  return null;
}

function mimeFromPath(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}
