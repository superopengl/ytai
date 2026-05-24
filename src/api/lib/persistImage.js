import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildKey, isS3Enabled, putObject } from './s3.js';

// Persist a flattened-canvas PNG/JPEG/WebP. In prod (YTAI_S3_BUCKET set)
// the bytes go to s3://bucket/images/<hash>.<ext>. In dev they land on
// local disk under YTAI_IMAGE_DIR so offline work doesn't need AWS.
//
// The on-disk dedup check uses existsSync; S3 PutObject is idempotent on
// the same key, so a re-upload is just an overwrite (cheap, content-identical).
export default async function persistImage({ bytes, contentHash, mimeType }) {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
  const filename = `${contentHash}.${ext}`;

  if (isS3Enabled()) {
    const key = buildKey(`images/${filename}`);
    const storageUrl = await putObject({ key, bytes, contentType: mimeType || 'image/png' });
    return { storageUrl };
  }

  const dir = process.env.YTAI_IMAGE_DIR || './data/images';
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  if (!existsSync(fullPath)) {
    await writeFile(fullPath, bytes);
  }
  return { storageUrl: `file://${path.resolve(fullPath)}`, localPath: fullPath };
}
