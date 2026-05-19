// Match a Brain-supplied query against the OCR'd lines of an image and
// return the best matches with tight, normalized 0..1 bboxes.
//
// Two modes:
//   - Single-phrase (default): pass `query`. Returns matching lines + a
//     unionBbox over them. Use for short, single-line targets.
//   - Region: also pass `endQuery`. Returns a spanning bbox from the start
//     anchor's line down to the end anchor's line, expanded horizontally to
//     cover every OCR line that sits between them. Use for highlighting a
//     whole multi-line question or worked-solution block.
//
// Returns:
//   { status, matches, unionBbox?, error? }
//     status: 'ready' | 'pending' | 'failed' | 'unavailable' | 'no-match'
//     matches: [{ text, bbox, confidence, score }]   (best first, ≤ 5)
//     unionBbox: [x1, y1, x2, y2]                    (covers the region)
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
// 'pending'. EasyOCR on CPU is ~3–8s per image; 8s covers the common case
// without freezing the chat if the sidecar is sick.
const OCR_WAIT_MS = 8000;

export default async function findTextOnImage({ imageId, storageUrl, query, endQuery, log }) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  const trimmedEnd = typeof endQuery === 'string' ? endQuery.trim() : '';
  if (!trimmed) return { status: 'no-match', matches: [], error: 'empty query' };
  if (!imageId) return { status: 'unavailable', matches: [], error: 'no image' };

  log?.info(
    { imageId, query: trimmed, endQuery: trimmedEnd || undefined },
    'running OCR (find_text_on_image)'
  );

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

  if (!row) {
    log?.info({ imageId, query: trimmed, status: 'unavailable' }, 'OCR find complete');
    return { status: 'unavailable', matches: [] };
  }
  if (row.status === 'pending') {
    log?.info({ imageId, query: trimmed, status: 'pending' }, 'OCR find complete');
    return { status: 'pending', matches: [] };
  }
  if (row.status === 'failed') {
    log?.info(
      { imageId, query: trimmed, status: 'failed', error: row.error || null },
      'OCR find complete'
    );
    return { status: 'failed', matches: [], error: row.error || 'OCR failed' };
  }

  const lines = Array.isArray(row.lines) ? row.lines : [];
  if (lines.length === 0) {
    log?.info(
      { imageId, query: trimmed, status: 'no-match', reason: 'empty-ocr' },
      'OCR find complete'
    );
    return { status: 'no-match', matches: [] };
  }

  const startMatches = rankMatches(trimmed, lines);

  // Single-phrase mode (no end_query): behave exactly as before — return
  // every line that matched the one query, with their union as the bbox.
  if (!trimmedEnd) {
    if (startMatches.length === 0) {
      log?.info(
        { imageId, query: trimmed, status: 'no-match', lineCount: lines.length },
        'OCR find complete'
      );
      return { status: 'no-match', matches: [] };
    }
    const unionBbox = unionOf(startMatches.map((m) => m.bbox));
    log?.info(
      {
        imageId,
        query: trimmed,
        status: 'ready',
        matchCount: startMatches.length,
        topMatch: startMatches[0].text.slice(0, 120),
        topScore: startMatches[0].score,
        topBbox: startMatches[0].bbox,
        unionBbox
      },
      'OCR find complete'
    );
    return { status: 'ready', matches: startMatches, unionBbox };
  }

  // Region mode: locate the end anchor too, then build a bbox spanning from
  // the start row to the end row, widened to include any OCR line that sits
  // vertically between them. This catches middle lines that extend further
  // left/right than the anchor rows (very common with worksheet questions
  // where the first line is indented past the body).
  const endMatches = rankMatches(trimmedEnd, lines);
  if (startMatches.length === 0 || endMatches.length === 0) {
    const missing = startMatches.length === 0 ? 'start' : 'end';
    log?.info(
      {
        imageId,
        query: trimmed,
        endQuery: trimmedEnd,
        status: 'no-match',
        missing,
        lineCount: lines.length
      },
      'OCR region find: anchor missing'
    );
    return {
      status: 'no-match',
      matches: missing === 'end' ? startMatches : [],
      error:
        missing === 'start'
          ? `start query "${trimmed}" not found — try a different phrase from the beginning of the region.`
          : `end query "${trimmedEnd}" not found — try a different phrase from the end of the region.`
    };
  }

  const startBox = startMatches[0].bbox;
  const endBox = endMatches[0].bbox;
  // min/max handles the case where Brain swapped start/end or the end
  // anchor happened to land slightly above the start (multi-column layouts).
  const regionY1 = Math.min(startBox[1], endBox[1]);
  const regionY2 = Math.max(startBox[3], endBox[3]);
  let regionX1 = Math.min(startBox[0], endBox[0]);
  let regionX2 = Math.max(startBox[2], endBox[2]);

  // Walk every OCR line whose vertical center sits between the anchors and
  // pull its horizontal extent into the region. Without this, a question
  // whose middle lines extend further right than the first line would get
  // its right edge clipped.
  let middleLineCount = 0;
  for (const line of lines) {
    const lb = line?.bbox;
    if (!Array.isArray(lb) || lb.length < 4) continue;
    const [lx, ly, lw, lh] = lb;
    if (lw <= 0 || lh <= 0) continue;
    const lyCenter = ly + lh / 2;
    if (lyCenter < regionY1 || lyCenter > regionY2) continue;
    middleLineCount += 1;
    if (lx < regionX1) regionX1 = lx;
    if (lx + lw > regionX2) regionX2 = lx + lw;
  }

  const regionBbox = [regionX1, regionY1, regionX2, regionY2];
  log?.info(
    {
      imageId,
      query: trimmed,
      endQuery: trimmedEnd,
      status: 'ready',
      startMatch: startMatches[0].text.slice(0, 80),
      endMatch: endMatches[0].text.slice(0, 80),
      middleLineCount,
      regionBbox
    },
    'OCR region find complete'
  );

  return {
    status: 'ready',
    matches: [startMatches[0], endMatches[0]],
    unionBbox: regionBbox
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
    // Convert OCR's native [x, y, w, h] to the canonical [x1, y1, x2, y2]
    // corner shape used elsewhere in the system before returning.
    const [bx, by, bw, bh] = line.bbox;
    scored.push({
      text: line.text,
      bbox: [bx, by, bx + bw, by + bh],
      confidence: typeof line.confidence === 'number' ? line.confidence : null,
      score
    });
  }

  scored.sort((a, b) => b.score - a.score || (b.confidence ?? 0) - (a.confidence ?? 0));
  return scored.slice(0, MAX_MATCHES);
}

// Union of [x1, y1, x2, y2] corner bboxes, returned in the same corner
// shape. Bboxes here are already in the canonical format (rankMatches
// converted on the way out of OCR storage).
function unionOf(bboxes) {
  if (!Array.isArray(bboxes) || bboxes.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const b of bboxes) {
    if (!Array.isArray(b) || b.length < 4) continue;
    const [x1, y1, x2, y2] = b;
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  }
  if (maxX <= minX || maxY <= minY) return null;
  return [minX, minY, maxX, maxY];
}
