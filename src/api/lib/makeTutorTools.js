import { ANNOTATION_COLOR_NAMES, resolveAnnotationColor } from './annotationPalette.js';
import findTextOnImage from './findTextOnImage.js';
import lookupOnImage from './lookupOnImage.js';
import snapAnnotationBbox from './snapAnnotationBbox.js';

// Build the dispatchTool function runBrainTurn calls. The factory closes over
// per-request context (active doc + pages, abort signal, SSE emitter,
// used-color set) so runBrainTurn stays generic — it sees
// `(call) => { result, progress }`.
//
// `progress: true` means the call produced actionable data Brain can use
// (e.g. find_text_on_image returned a real bbox, lookup_on_image returned
// an answer, draw_annotation actually drew). `progress: false` means the
// call failed in a way Brain has to recover from (no-match, missing args,
// unknown tool). runBrainTurn uses this to distinguish "Brain is making
// progress but not talking" from "Brain is spinning on errors."
//
// Side effects each tool may have:
//   find_text_on_image: emits SSE lookup-start / lookup
//   lookup_on_image:    emits SSE lookup-start / lookup
//   draw_annotation:    snaps bbox via OCR, picks an unused palette color,
//                       mutates call.args in place, emits SSE tool
export default function makeTutorTools({
  activeDoc,
  viewingPage,
  log,
  emit,
  usedColorsForTurn,
  signal
}) {
  const pages = activeDoc?.pages ?? [];
  return async function dispatchTool(call) {
    if (call.name === 'find_text_on_image') {
      return dispatchFindText(call, { pages, log, emit });
    }
    if (call.name === 'lookup_on_image') {
      return dispatchLookup(call, { pages, viewingPage, log, emit, signal });
    }
    if (call.name === 'draw_annotation') {
      return dispatchDrawAnnotation(call, { pages, viewingPage, log, emit, usedColorsForTurn });
    }
    log?.warn({ name: call.name }, 'Brain requested unknown tool — ignoring');
    return { result: { error: `Unknown tool: ${call.name}` }, progress: false };
  };
}

function findPage(pages, pageNumber) {
  if (!Number.isInteger(pageNumber)) return null;
  return pages.find((p) => p.pageNumber === pageNumber) ?? null;
}

function pageRangeLabel(pages) {
  if (pages.length === 0) return '';
  if (pages.length === 1) return '1';
  return `1..${pages.length}`;
}

async function dispatchFindText(call, { pages, log, emit }) {
  const query = typeof call.args?.query === 'string' ? call.args.query.trim() : '';
  const endQuery =
    typeof call.args?.end_query === 'string' ? call.args.end_query.trim() : '';
  const restrictToPage = Number.isInteger(call.args?.page) ? call.args.page : null;

  if (pages.length === 0) {
    return { result: { error: 'No image is attached to this session.' }, progress: false };
  }
  if (!query) {
    return {
      result: { status: 'no-match', matches: [], error: 'query is required' },
      progress: false
    };
  }

  const scopeLabel = restrictToPage ? `p${restrictToPage}` : `p${pageRangeLabel(pages)}`;
  const label = endQuery
    ? `find ${scopeLabel}: "${query}" → "${endQuery}"`
    : `find ${scopeLabel}: "${query}"`;
  emit('lookup-start', { id: call.id, question: label });

  let result;
  try {
    result = await findTextOnImage({
      pages: pages.map((p) => ({
        imageId: p.id,
        pageNumber: p.pageNumber,
        storageUrl: p.storageUrl
      })),
      restrictToPage,
      query,
      endQuery: endQuery || undefined,
      log
    });
  } catch (err) {
    log?.error({ err, query, endQuery }, 'find_text_on_image failed');
    result = {
      status: 'failed',
      matches: [],
      error: `OCR call failed: ${err.message?.slice(0, 200) ?? 'unknown error'}`
    };
  }
  emit('lookup', { id: call.id, question: label, result });
  const progress =
    result.status === 'ready' && Array.isArray(result.matches) && result.matches.length > 0;
  return { result, progress };
}

async function dispatchLookup(call, { pages, viewingPage, log, emit, signal }) {
  const question = typeof call.args?.question === 'string' ? call.args.question.trim() : '';
  // Brain is told `page` is required, but fall back to viewing page or
  // page 1 if it forgot — beats a hard error that wastes a round.
  const requestedPage = Number.isInteger(call.args?.page) ? call.args.page : null;
  const fallbackPage =
    Number.isInteger(viewingPage) && viewingPage >= 1 ? viewingPage : 1;
  const pageNumber = requestedPage ?? fallbackPage;
  const targetPage = findPage(pages, pageNumber);

  if (pages.length === 0) {
    return { result: { error: 'No image is attached to this session.' }, progress: false };
  }
  if (!targetPage) {
    return {
      result: {
        error:
          `page ${pageNumber} is not in this doc (valid: 1..${pages.length}). ` +
          'Reissue lookup_on_image with a valid page number.'
      },
      progress: false
    };
  }
  if (!question) {
    return {
      result: { error: 'lookup_on_image requires a non-empty question.' },
      progress: false
    };
  }

  const label = pages.length > 1 ? `p${targetPage.pageNumber}: ${question}` : question;
  emit('lookup-start', { id: call.id, question: label });
  let result;
  try {
    result = await lookupOnImage({
      image: { id: targetPage.id, storageUrl: targetPage.storageUrl },
      question,
      log,
      signal
    });
  } catch (err) {
    log?.error({ err, question, page: targetPage.pageNumber }, 'lookup_on_image failed');
    result = { error: `Vision call failed: ${err.message?.slice(0, 200) ?? 'unknown error'}` };
  }
  emit('lookup', { id: call.id, question: label, result });
  const progress = !result.error && typeof result.answer === 'string' && result.answer.length > 0;
  return { result, progress };
}

async function dispatchDrawAnnotation(call, { pages, viewingPage, log, emit, usedColorsForTurn }) {
  const cornerKeys = ['x1', 'y1', 'x2', 'y2'];
  const missingCorners = cornerKeys.filter(
    (k) => typeof call.args?.[k] !== 'number' || Number.isNaN(call.args[k])
  );
  if (missingCorners.length > 0) {
    log?.warn(
      { missing: missingCorners, args: call.args },
      'draw_annotation: missing bbox corners — asking Brain to retry'
    );
    return {
      result: {
        error:
          `draw_annotation requires all four corners (${cornerKeys.join(', ')}). ` +
          `Missing or non-number: ${missingCorners.join(', ')}. ` +
          `Resend the full call with every corner — get the bbox from your last lookup result.`
      },
      progress: false
    };
  }
  if (call.args.x2 <= call.args.x1 || call.args.y2 <= call.args.y1) {
    log?.warn(
      { args: call.args },
      'draw_annotation: zero-area or inverted bbox — asking Brain to retry'
    );
    return {
      result: {
        error:
          `draw_annotation needs x2 > x1 and y2 > y1. Got x1=${call.args.x1}, ` +
          `y1=${call.args.y1}, x2=${call.args.x2}, y2=${call.args.y2}.`
      },
      progress: false
    };
  }

  // Resolve which page this annotation lives on. Brain is told `page` is
  // required; we fall back to viewing page or page 1 to keep a missing
  // value from blowing up a perfectly good bbox.
  const requestedPage = Number.isInteger(call.args?.page) ? call.args.page : null;
  const fallbackPage =
    Number.isInteger(viewingPage) && viewingPage >= 1 ? viewingPage : 1;
  const pageNumber = requestedPage ?? fallbackPage;
  const targetPage = findPage(pages, pageNumber);
  if (!targetPage) {
    return {
      result: {
        error:
          `page ${pageNumber} is not in this doc (valid: 1..${pages.length}). ` +
          'Reissue draw_annotation with the correct page.'
      },
      progress: false
    };
  }

  // Normalize color (same logic as before, just lifted out).
  const requestedName =
    typeof call.args?.color === 'string' ? call.args.color.toLowerCase() : null;
  let colorName =
    requestedName && resolveAnnotationColor(requestedName) ? requestedName : null;
  if (!colorName || usedColorsForTurn.has(colorName)) {
    colorName =
      ANNOTATION_COLOR_NAMES.find((c) => !usedColorsForTurn.has(c)) ||
      colorName ||
      ANNOTATION_COLOR_NAMES[0];
  }
  usedColorsForTurn.add(colorName);
  call.args = {
    ...call.args,
    page: targetPage.pageNumber,
    color: resolveAnnotationColor(colorName),
    colorName,
    label: typeof call.args?.label === 'string' ? call.args.label.slice(0, 60) : ''
  };

  // Snap to the OCR of the target page only.
  const supplied = [call.args.x1, call.args.y1, call.args.x2, call.args.y2];
  try {
    const snap = await snapAnnotationBbox({
      imageId: targetPage.id,
      bbox: supplied,
      log
    });
    if (snap.snapped) {
      call.args = {
        ...call.args,
        x1: snap.bbox[0],
        y1: snap.bbox[1],
        x2: snap.bbox[2],
        y2: snap.bbox[3]
      };
    } else {
      log?.info(
        { reason: snap.reason },
        'draw_annotation: snap skipped — forwarding original bbox'
      );
    }
  } catch (err) {
    log?.warn({ err: err.message }, 'draw_annotation: snap failed — forwarding original bbox');
  }
  emit('tool', call);
  return { result: { ok: true }, progress: true };
}
