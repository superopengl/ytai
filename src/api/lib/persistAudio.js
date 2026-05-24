import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildKey, isS3Enabled, putObject } from './s3.js';

// Persist a synthesized-MP3 byte buffer. Prod writes to
// s3://bucket/audio/<hash>.mp3 so the cache survives container restarts;
// dev writes to YTAI_AUDIO_DIR on local disk.
export default async function persistAudio({ bytes, contentHash }) {
  const filename = `${contentHash}.mp3`;

  if (isS3Enabled()) {
    const key = buildKey(`audio/${filename}`);
    const storageUrl = await putObject({ key, bytes, contentType: 'audio/mpeg' });
    return { storageUrl };
  }

  const dir = process.env.YTAI_AUDIO_DIR || './data/audio';
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  if (!existsSync(fullPath)) {
    await writeFile(fullPath, bytes);
  }
  return { storageUrl: `file://${path.resolve(fullPath)}`, localPath: fullPath };
}
