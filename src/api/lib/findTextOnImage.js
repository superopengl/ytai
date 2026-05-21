// Match a Brain-supplied query against the OCR'd lines of an image (or
// a whole doc's worth of pages) and return the best matches with tight,
// normalized 0..1 bboxes.
//
// Modes:
//   - Single-image, single-phrase (default): pass `pages: [{imageId,
//     pageNumber, storageUrl}]` with one entry and `query`. Returns
//     matching lines + a unionBbox on that page.
//   - Multi-page: pass multiple `pages`. The matcher runs over every
//     page's OCR; each match carries the page it came from. The best-
//     scoring page's union is returned as `unionBbox` and `page`.
//   - Region: also pass `endQuery`. The matcher locates the start anchor
//     and end anchor on the SAME page (the page where both have the
//     best combined score) and returns a spanning bbox.
//
// Returns:
//   { status, page?, matches, unionBbox?, error? }
//     status: 'ready' | 'pending' | 'failed' | 'unavailable' | 'no-match'
//     page:   the page (1..N) the result is anchored on (when matches found)
//     matches: [{ text, page, bbox, confidence, score }]   (best first, ≤ 5)
//     unionBbox: [x1, y1, x2, y2]                          (covers the region)

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

// `pages` is the full ordered page list of the current doc:
//   [{ imageId, pageNumber, storageUrl }]
// `restrictToPage` (optional, 1-based) narrows the matcher to one page.
export default async function findTextOnImage({ pages, restrictToPage, query, endQuery, log }) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  const trimmedEnd = typeof endQuery === 'string' ? endQuery.trim() : '';
  if (!trimmed) return { status: 'no-match', matches: [], error: 'empty query' };
  if (!Array.isArray(pages) || pages.length === 0) {
    return { status: 'unavailable', matches: [], error: 'no image' };
  }

  const scope = Number.isInteger(restrictToPage)
    ? pages.filter((p) => p.pageNumber === restrictToPage)
    : pages;
  if (scope.length === 0) {
    return {
      status: 'no-match',
      matches: [],
      error: `page ${restrictToPage} is not in this doc`
    };
  }

  log?.info(
    {
      pageCount: scope.length,
      restrictToPage: restrictToPage || null,
      query: trimmed,
      endQuery: trimmedEnd || undefined
    },
    'running OCR (find_text_on_image)'
  );

  // Resolve OCR for every scoped page, kicking jobs and briefly waiting
  // when needed. Per-page so a slow page doesn't block faster ones.
  const ocrByPage = new Map();
  await Promise.all(
    scope.map(async (p) => {
      const row = await resolveOcrRow({ imageId: p.imageId, storageUrl: p.storageUrl, log });
      ocrByPage.set(p.pageNumber, { page: p, row });
    })
  );

  // Single-page fast path keeps the original status semantics — caller
  // expects a precise pending/failed/unavailable when the page they
  // care about isn't OCR'd yet.
  if (scope.length === 1) {
    const entry = ocrByPage.get(scope[0].pageNumber);
    const status = readiness(entry.row);
    if (status.kind !== 'ready') return statusResult(status, trimmed, entry.page.pageNumber);
    return runOneMode({
      lines: entry.row.lines || [],
      page: entry.page.pageNumber,
      query: trimmed,
      endQuery: trimmedEnd,
      log
    });
  }

  // Multi-page mode: run the matcher per page, pick the best-scoring page,
  // return that one's result. Pages that aren't ready yet are skipped.
  let bestPageResult = null;
  let bestScore = -1;
  const pendingPages = [];
  const failedPages = [];
  for (const p of scope) {
    const entry = ocrByPage.get(p.pageNumber);
    const status = readiness(entry.row);
    if (status.kind === 'pending') pendingPages.push(p.pageNumber);
    if (status.kind === 'failed' || status.kind === 'unavailable') failedPages.push(p.pageNumber);
    if (status.kind !== 'ready') continue;
    const candidate = runOneMode({
      lines: entry.row.lines || [],
      page: p.pageNumber,
      query: trimmed,
      endQuery: trimmedEnd,
      log: null
    });
    if (candidate.status !== 'ready' || !Array.isArray(candidate.matches) || candidate.matches.length === 0) continue;
    const topScore = candidate.matches[0]?.score ?? 0;
    if (topScore > bestScore) {
      bestScore = topScore;
      bestPageResult = candidate;
    }
  }

  if (bestPageResult) {
    log?.info(
      {
        winningPage: bestPageResult.page,
        topScore: bestScore,
        query: trimmed,
        endQuery: trimmedEnd || undefined
      },
      'OCR multi-page find complete'
    );
    return bestPageResult;
  }

  // No page produced a match. If any pages were still pending, surface
  // that so Brain knows to retry (not fall back to Eyes yet). Otherwise
  // report no-match.
  if (pendingPages.length > 0) {
    return {
      status: 'pending',
      matches: [],
      error: `OCR still running on page(s) ${pendingPages.join(', ')}`
    };
  }
  log?.info(
    {
      query: trimmed,
      endQuery: trimmedEnd || undefined,
      pageCount: scope.length,
      failedPages
    },
    'OCR multi-page find: no-match'
  );
  return { status: 'no-match', matches: [] };
}

async function resolveOcrRow({ imageId, storageUrl, log }) {
  let row = await readOcrRow(imageId);
  if (!row && storageUrl) {
    log?.info({ imageId }, 'findTextOnImage: no OCR row — kicking and waiting');
    const job = ensureImageOcr({ imageId, storageUrl, log });
    await Promise.race([job, sleep(OCR_WAIT_MS)]);
    row = await readOcrRow(imageId);
  } else if (row?.status === 'pending') {
    log?.info({ imageId }, 'findTextOnImage: OCR pending — waiting');
    await Promise.race([
      pollUntilReady(imageId, OCR_WAIT_MS),
      sleep(OCR_WAIT_MS)
    ]);
    row = await readOcrRow(imageId);
  }
  return row;
}

function readiness(row) {
  if (!row) return { kind: 'unavailable' };
  if (row.status === 'pending') return { kind: 'pending' };
  if (row.status === 'failed') return { kind: 'failed', error: row.error || 'OCR failed' };
  if (row.status !== 'ready') return { kind: 'unavailable' };
  return { kind: 'ready' };
}

function statusResult(status, query, page) {
  if (status.kind === 'pending') return { status: 'pending', matches: [], page };
  if (status.kind === 'failed') return { status: 'failed', matches: [], page, error: status.error };
  if (status.kind === 'unavailable') return { status: 'unavailable', matches: [], page };
  return { status: 'no-match', matches: [], page };
}

// Run the (single-phrase OR region) matcher against one page's OCR lines.
// Pulled out so multi-page mode can call it per page and pick a winner.
function runOneMode({ lines, page, query, endQuery, log }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { status: 'no-match', matches: [], page };
  }

  const startMatches = rankMatches(query, lines).map((m) => ({ ...m, page }));

  if (!endQuery) {
    if (startMatches.length === 0) return { status: 'no-match', matches: [], page };
    const unionBbox = unionOf(startMatches.map((m) => m.bbox));
    log?.info(
      {
        page,
        query,
        status: 'ready',
        matchCount: startMatches.length,
        topMatch: startMatches[0].text.slice(0, 120),
        topScore: startMatches[0].score,
        topBbox: startMatches[0].bbox,
        unionBbox
      },
      'OCR find complete'
    );
    return { status: 'ready', page, matches: startMatches, unionBbox };
  }

  const endMatches = rankMatches(endQuery, lines).map((m) => ({ ...m, page }));
  if (startMatches.length === 0 || endMatches.length === 0) {
    const missing = startMatches.length === 0 ? 'start' : 'end';
    return {
      status: 'no-match',
      page,
      matches: missing === 'end' ? startMatches : [],
      error:
        missing === 'start'
          ? `start query "${query}" not found — try a different phrase from the beginning of the region.`
          : `end query "${endQuery}" not found — try a different phrase from the end of the region.`
    };
  }

  const startBox = startMatches[0].bbox;
  const endBox = endMatches[0].bbox;
  const regionY1 = Math.min(startBox[1], endBox[1]);
  const regionY2 = Math.max(startBox[3], endBox[3]);
  let regionX1 = Math.min(startBox[0], endBox[0]);
  let regionX2 = Math.max(startBox[2], endBox[2]);

  for (const line of lines) {
    const lb = line?.bbox;
    if (!Array.isArray(lb) || lb.length < 4) continue;
    const [lx, ly, lw, lh] = lb;
    if (lw <= 0 || lh <= 0) continue;
    const lyCenter = ly + lh / 2;
    if (lyCenter < regionY1 || lyCenter > regionY2) continue;
    if (lx < regionX1) regionX1 = lx;
    if (lx + lw > regionX2) regionX2 = lx + lw;
  }

  const regionBbox = [regionX1, regionY1, regionX2, regionY2];
  log?.info(
    {
      page,
      query,
      endQuery,
      status: 'ready',
      startMatch: startMatches[0].text.slice(0, 80),
      endMatch: endMatches[0].text.slice(0, 80),
      regionBbox
    },
    'OCR region find complete'
  );

  return {
    status: 'ready',
    page,
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
