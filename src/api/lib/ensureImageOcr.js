// Idempotent OCR scheduler. Call after we've persisted a session_image row;
// it inserts a `pending` image_ocr row (if missing), kicks the sidecar in
// the background, and writes the result back to the same row.
//
// - If YTAI_OCR_BASE_URL is unset, no-op. The OCR feature is fully optional.
// - If a row already exists (any status), we don't re-run — OCR results are
//   deterministic per image_id, and re-running on every turn would thrash
//   the sidecar for free.
// - Errors are recorded (status='failed') so Brain can read the page through
//   Eyes without waiting on a flaky sidecar.
//
// Tracking the in-flight promise in IN_FLIGHT lets the find_text_on_image
// handler await it instead of returning empty when Brain asks faster than
// EasyOCR can answer.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { imageOcr } from '../db/schema.js';
import runOcr from './runOcr.js';

const IN_FLIGHT = new Map(); // imageId -> Promise

export default function ensureImageOcr({ imageId, storageUrl, log }) {
  if (!imageId) return Promise.resolve(null);
  const baseUrl = process.env.YTAI_OCR_BASE_URL || '';
  if (!baseUrl) return Promise.resolve(null);

  const existing = IN_FLIGHT.get(imageId);
  if (existing) return existing;

  const job = (async () => {
    try {
      const [row] = await db()
        .insert(imageOcr)
        .values({ imageId, status: 'pending' })
        .onConflictDoNothing()
        .returning({ status: imageOcr.status });

      // If onConflictDoNothing returned no row, OCR already exists for this
      // image (pending, ready, or failed). Don't restart — caller can poll.
      if (!row) {
        const [current] = await db()
          .select({ status: imageOcr.status })
          .from(imageOcr)
          .where(eq(imageOcr.imageId, imageId));
        log?.info(
          { imageId, status: current?.status },
          'ensureImageOcr: row exists — skipping'
        );
        return current?.status ?? 'unknown';
      }

      const bytes = await loadImageBytes(storageUrl);
      if (!bytes) {
        await db()
          .update(imageOcr)
          .set({
            status: 'failed',
            error: 'image bytes unavailable',
            updatedAt: new Date()
          })
          .where(eq(imageOcr.imageId, imageId));
        log?.warn({ imageId, storageUrl }, 'ensureImageOcr: image bytes unavailable');
        return 'failed';
      }

      log?.info({ imageId, baseUrl }, 'ensureImageOcr: running EasyOCR');
      const result = await runOcr({
        bytes,
        baseUrl,
        apiKey: process.env.YTAI_OCR_API_KEY || ''
      });

      await db()
        .update(imageOcr)
        .set({
          status: 'ready',
          lines: result.lines,
          modelVersion: result.modelVersion,
          updatedAt: new Date()
        })
        .where(eq(imageOcr.imageId, imageId));

      log?.info(
        { imageId, lineCount: result.lines.length, modelVersion: result.modelVersion },
        'ensureImageOcr: ready'
      );
      return 'ready';
    } catch (err) {
      log?.error({ err: err.message, imageId }, 'ensureImageOcr: failed');
      try {
        await db()
          .update(imageOcr)
          .set({
            status: 'failed',
            error: String(err.message ?? err).slice(0, 500),
            updatedAt: new Date()
          })
          .where(eq(imageOcr.imageId, imageId));
      } catch {
        // best-effort — if even the failure write fails, swallow it
      }
      return 'failed';
    } finally {
      IN_FLIGHT.delete(imageId);
    }
  })();

  IN_FLIGHT.set(imageId, job);
  return job;
}

async function loadImageBytes(storageUrl) {
  if (typeof storageUrl !== 'string' || storageUrl.length === 0) return null;
  if (!storageUrl.startsWith('file://')) return null; // s3 support: future
  try {
    return await readFile(fileURLToPath(storageUrl));
  } catch {
    return null;
  }
}
