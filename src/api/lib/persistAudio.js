import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export default async function persistAudio({ bytes, contentHash }) {
  const dir = process.env.YTAI_AUDIO_DIR || './data/audio';
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, `${contentHash}.mp3`);
  if (!existsSync(fullPath)) {
    await writeFile(fullPath, bytes);
  }
  return { storageUrl: `file://${path.resolve(fullPath)}`, localPath: fullPath };
}
