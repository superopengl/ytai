// Tighten a Brain-supplied annotation bbox using the image's OCR lines.
//
// Why: Eyes often returns loose, slightly drifted regions around printed
// text. EasyOCR boxes are tight and deterministic. When Brain calls
// draw_annotation — whether the bbox came from Eyes, from
// find_text_on_image, or from Brain's imagination — we snap to the union
// of OCR lines that sit inside the supplied region so the on-page mark
// hugs the actual text instead of floating over whitespace around it.
//
// Input/output bbox is canonical corner format [x1, y1, x2, y2] in 0..1.
// Returns { snapped, bbox, lineCount }. `snapped` is false when we left
// the original bbox alone (OCR unavailable, no overlap, supplied region
// too big to be trustworthy, etc.) — caller forwards the original.
//
// Note: image_ocr.lines stores bboxes in OCR's native [x, y, w, h]; we
// translate to corners inside the loop below. (rankMatches in
// findTextOnImage does the same translation on its own output.)

import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { imageOcr } from '../db/schema.js';

// Don't snap when Brain (or Eyes) hands us a region this large or larger —
// at that point the user probably wants a sweep over a whole question
// block, not just one printed phrase, and shrinking it to the tightest
// inner text would feel wrong.
const MAX_SUPPLIED_AREA = 0.35; // 35% of the page

// An OCR line "belongs" to the supplied region only if most of its own
// area falls inside. This keeps stray edge-of-bbox lines from polluting
// the snap.
const MIN_LINE_OVERLAP = 0.55;

// Tiny breathing room around the OCR union so the mark doesn't visually
// clip the glyphs. Expressed as a fraction of bbox dimensions.
const PAD_X = 0.01;
const PAD_Y = 0.05;

export default async function snapAnnotationBbox({ imageId, bbox, log }) {
  if (!Array.isArray(bbox) || bbox.length < 4) {
    return { snapped: false, bbox, lineCount: 0, reason: 'invalid-input' };
  }
  const [sx1, sy1, sx2, sy2] = bbox.map(Number);
  if ([sx1, sy1, sx2, sy2].some((v) => !Number.isFinite(v)) || sx2 <= sx1 || sy2 <= sy1) {
    return { snapped: false, bbox, lineCount: 0, reason: 'invalid-input' };
  }
  const supArea = (sx2 - sx1) * (sy2 - sy1);
  if (supArea >= MAX_SUPPLIED_AREA) {
    return { snapped: false, bbox, lineCount: 0, reason: 'supplied-too-large' };
  }
  if (!imageId) {
    return { snapped: false, bbox, lineCount: 0, reason: 'no-image' };
  }

  const [row] = await db()
    .select({ status: imageOcr.status, lines: imageOcr.lines })
    .from(imageOcr)
    .where(eq(imageOcr.imageId, imageId));

  if (!row || row.status !== 'ready' || !Array.isArray(row.lines) || row.lines.length === 0) {
    return { snapped: false, bbox, lineCount: 0, reason: row?.status || 'no-ocr' };
  }

  let unionLeft = 1;
  let unionTop = 1;
  let unionRight = 0;
  let unionBottom = 0;
  let hit = 0;

  for (const line of row.lines) {
    const lb = line?.bbox;
    if (!Array.isArray(lb) || lb.length < 4) continue;
    // OCR stores xywh; convert to corners for the overlap math.
    const [lx, ly, lw, lh] = lb;
    if (lw <= 0 || lh <= 0) continue;
    const lx1 = lx;
    const ly1 = ly;
    const lx2 = lx + lw;
    const ly2 = ly + lh;

    const ix1 = Math.max(sx1, lx1);
    const iy1 = Math.max(sy1, ly1);
    const ix2 = Math.min(sx2, lx2);
    const iy2 = Math.min(sy2, ly2);
    if (ix2 <= ix1 || iy2 <= iy1) continue;

    const lineArea = lw * lh;
    const overlap = (ix2 - ix1) * (iy2 - iy1);
    if (overlap / lineArea < MIN_LINE_OVERLAP) continue;

    if (lx1 < unionLeft) unionLeft = lx1;
    if (ly1 < unionTop) unionTop = ly1;
    if (lx2 > unionRight) unionRight = lx2;
    if (ly2 > unionBottom) unionBottom = ly2;
    hit += 1;
  }

  if (hit === 0) {
    return { snapped: false, bbox, lineCount: 0, reason: 'no-overlap' };
  }

  const padX = (unionRight - unionLeft) * PAD_X;
  const padY = (unionBottom - unionTop) * PAD_Y;
  const x1 = clamp01(unionLeft - padX);
  const y1 = clamp01(unionTop - padY);
  const x2 = clamp01(unionRight + padX);
  const y2 = clamp01(unionBottom + padY);
  const snappedBbox = [x1, y1, x2, y2];

  log?.info(
    {
      imageId,
      from: bbox,
      to: snappedBbox,
      lineCount: hit
    },
    'draw_annotation: snapped to OCR'
  );

  return { snapped: true, bbox: snappedBbox, lineCount: hit };
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
