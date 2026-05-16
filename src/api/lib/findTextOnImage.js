// Match a Brain-supplied query against the OCR'd lines of an image and
// return the best matches with tight, normalized 0..1 bboxes.
//
// Returns:
//   { status, matches, unionBbox?, error? }
//     status: 'ready' | 'pending' | 'failed' | 'unavailable' | 'no-match'
//     matches: [{ text, bbox, confidence, score }]   (best first, ≤ 5)
//     unionBbox: [x, y, w, h]                        (covers all matches, if 1+)
//
// Brain reads `status`:
//   - 'ready' + matches      → use unionBbox / first bbox for draw_annotation
//   - 'no-match' / 'pending' / 'failed' / 'unavailable' → fall back to lookup_on_image
//
// Matching strategy (cheap first, escalate as needed):
//   1. exact-substring of normalized query in normalized line  (score 1.0)
//   2. fraction of unique query tokens present in the line     (score 0..1)
// We never call back into the model; this is pure string work.

import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { imageOcr } from '../db/schema.js';
import ensureImageOcr from './ensureImageOcr.js';

const MIN_TOKEN_SCORE = 0.6; // ≥ 60% of query tokens must appear in the line
const MAX_MATCHES = 5;
// How long to wait for an in-flight OCR job before giving up and returning
// 'pending'. PaddleOCR on CPU is ~1–3s per image; 4s covers the common case
// without freezing the chat if the sidecar is sick.
const OCR_WAIT_MS = 4000;

export default async function findTextOnImage({ imageId, storageUrl, query, log }) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed) return { status: 'no-match', matches: [], error: 'empty query' };
  if (!imageId) return { status: 'unavailable', matches: [], error: 'no image' };

  let row = await readOcrRow(imageId);

  // Image has no OCR row yet — likely the request came in before the
  // background job started (or it didn't get kicked, e.g. server restart).
  // Kick it now and wait briefly.
  if (!row && storageUrl) {
    log?.info({ imageId }, 'findTextOnImage: no OCR row — kicking and waiting');
    const job = ensureImageOcr({ imageId, storageUrl, log });
    await Promise.race([job, sleep(OCR_WAIT_MS)]);
    row = await readOcrRow(imageId);
  } else if (row?.status === 'pending') {
    // A job is in flight; wait it out so the very first turn after upload
    // still benefits from OCR instead of skipping straight to Eyes.
    log?.info({ imageId }, 'findTextOnImage: OCR pending — waiting');
    await Promise.race([
      pollUntilReady(imageId, OCR_WAIT_MS),
      sleep(OCR_WAIT_MS)
    ]);
    row = await readOcrRow(imageId);
  }

  if (!row) return { status: 'unavailable', matches: [] };
  if (row.status === 'pending') return { status: 'pending', matches: [] };
  if (row.status === 'failed') {
    return { status: 'failed', matches: [], error: row.error || 'OCR failed' };
  }

  const lines = Array.isArray(row.lines) ? row.lines : [];
  if (lines.length === 0) return { status: 'no-match', matches: [] };

  const matches = rankMatches(trimmed, lines);
  if (matches.length === 0) return { status: 'no-match', matches: [] };

  return {
    status: 'ready',
    matches,
    unionBbox: unionOf(matches.map((m) => m.bbox))
  };
}

async function readOcrRow(imageId) {
  const [row] = await db()
    .select({
      status: imageOcr.status,
      lines: imageOcr.lines,
      error: imageOcr.error
    })
    .from(imageOcr)
    .where(eq(imageOcr.imageId, imageId));
  return row ?? null;
}

async function pollUntilReady(imageId, budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const row = await readOcrRow(imageId);
    if (row && row.status !== 'pending') return;
    await sleep(200);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(s) {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function rankMatches(query, lines) {
  const qNorm = normalize(query);
  const qTokens = new Set(tokenize(query));
  const scored = [];

  for (const line of lines) {
    if (!line?.text || !Array.isArray(line.bbox)) continue;
    const lNorm = normalize(line.text);
    let score = 0;
    if (qNorm && lNorm.includes(qNorm)) {
      score = 1;
    } else if (qTokens.size > 0) {
      const lTokens = new Set(tokenize(line.text));
      let hit = 0;
      for (const t of qTokens) if (lTokens.has(t)) hit += 1;
      score = hit / qTokens.size;
      if (score < MIN_TOKEN_SCORE) continue;
    } else {
      continue;
    }
    scored.push({
      text: line.text,
      bbox: line.bbox,
      confidence: typeof line.confidence === 'number' ? line.confidence : null,
      score
    });
  }

  scored.sort((a, b) => b.score - a.score || (b.confidence ?? 0) - (a.confidence ?? 0));
  return scored.slice(0, MAX_MATCHES);
}

function unionOf(bboxes) {
  if (!Array.isArray(bboxes) || bboxes.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const b of bboxes) {
    if (!Array.isArray(b) || b.length < 4) continue;
    const [x, y, w, h] = b;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  if (maxX <= minX || maxY <= minY) return null;
  return [minX, minY, maxX - minX, maxY - minY];
}
