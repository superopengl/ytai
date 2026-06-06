import { ANNOTATION_COLOR_NAMES, resolveAnnotationColor } from './annotationPalette.js';

// Build the dispatchTool function runBrainTurn calls. The factory closes
// over per-request context (active doc + pages, abort signal, SSE emitter,
// used-color set) so runBrainTurn stays generic — it sees
// `(call) => { result, progress }`.
//
// Brain is multimodal and reads the worksheet directly in its user message,
// so the only tool that needs dispatch is `draw_annotation`. The bbox comes
// from Brain's own visual estimation; we just validate it, assign a palette
// color, and emit the SSE event the frontend canvas listens for.
//
// `progress: true` means the call produced actionable output (i.e. an
// annotation was actually emitted). `progress: false` means the call was
// rejected (bad bbox, bad page, unknown tool) and Brain has to recover.
export default function makeTutorTools({
  activeDoc,
  viewingPage,
  log,
  emit,
  usedColorsForTurn
}) {
  const pages = activeDoc?.pages ?? [];
  return async function dispatchTool(call) {
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
          `Resend the full call with every corner.`
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
    // Stable image id of the page this annotation lives on. Persisted so
    // the frontend can route the mark to the right canvas without having
    // to know which doc was current when the turn ran.
    imageId: targetPage.id,
    color: resolveAnnotationColor(colorName),
    colorName,
    label: typeof call.args?.label === 'string' ? call.args.label.slice(0, 60) : ''
  };
  emit('tool', call);
  return { result: { ok: true }, progress: true };
}
