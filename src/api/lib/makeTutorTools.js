import { ANNOTATION_COLOR_NAMES, resolveAnnotationColor } from './annotationPalette.js';
import findTextOnImage from './findTextOnImage.js';
import lookupOnImage from './lookupOnImage.js';
import snapAnnotationBbox from './snapAnnotationBbox.js';

// Build the dispatchTool function runBrainTurn calls. The factory closes over
// per-request context (image, abort signal, SSE emitter, used-color set) so
// runBrainTurn stays generic — it sees `(call) => { result, progress }`.
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
  activeImage,
  imageDataUrl,
  log,
  emit,
  usedColorsForTurn,
  signal
}) {
  return async function dispatchTool(call) {
    if (call.name === 'find_text_on_image') {
      return dispatchFindText(call, { activeImage, log, emit });
    }
    if (call.name === 'lookup_on_image') {
      return dispatchLookup(call, { activeImage, imageDataUrl, log, emit, signal });
    }
    if (call.name === 'draw_annotation') {
      return dispatchDrawAnnotation(call, { activeImage, log, emit, usedColorsForTurn });
    }
    log?.warn({ name: call.name }, 'Brain requested unknown tool — ignoring');
    return { result: { error: `Unknown tool: ${call.name}` }, progress: false };
  };
}

async function dispatchFindText(call, { activeImage, log, emit }) {
  const query = typeof call.args?.query === 'string' ? call.args.query.trim() : '';
  if (!activeImage) {
    return { result: { error: 'No image is attached to this session.' }, progress: false };
  }
  if (!query) {
    return {
      result: { status: 'no-match', matches: [], error: 'query is required' },
      progress: false
    };
  }
  emit('lookup-start', { id: call.id, question: `find: "${query}"` });
  let result;
  try {
    result = await findTextOnImage({
      imageId: activeImage.id,
      storageUrl: activeImage.storageUrl,
      query,
      log
    });
  } catch (err) {
    log?.error({ err, query }, 'find_text_on_image failed');
    result = {
      status: 'failed',
      matches: [],
      error: `OCR call failed: ${err.message?.slice(0, 200) ?? 'unknown error'}`
    };
  }
  emit('lookup', { id: call.id, question: `find: "${query}"`, result });
  // "ready" with at least one match means Brain now has a bbox to use —
  // that's progress. All other statuses (no-match, pending, failed,
  // unavailable) leave Brain empty-handed.
  const progress = result.status === 'ready' && Array.isArray(result.matches) && result.matches.length > 0;
  return { result, progress };
}

async function dispatchLookup(call, { activeImage, imageDataUrl, log, emit, signal }) {
  const question = typeof call.args?.question === 'string' ? call.args.question.trim() : '';
  if (!activeImage) {
    return { result: { error: 'No image is attached to this session.' }, progress: false };
  }
  if (!question) {
    return {
      result: { error: 'lookup_on_image requires a non-empty question.' },
      progress: false
    };
  }
  // Tell the UI Brain has paused to consult Eyes — without this, the chat
  // would freeze with no "Thinking…" indicator for however long the vision
  // call takes.
  emit('lookup-start', { id: call.id, question });
  let result;
  try {
    result = await lookupOnImage({
      image: activeImage,
      question,
      imageDataUrlForThisTurn: imageDataUrl,
      log,
      signal
    });
  } catch (err) {
    log?.error({ err, question }, 'lookup_on_image failed');
    result = { error: `Vision call failed: ${err.message?.slice(0, 200) ?? 'unknown error'}` };
  }
  emit('lookup', { id: call.id, question, result });
  // A non-error answer with content is progress; the image-unavailable /
  // vision-call-failed / empty-answer cases are not.
  const progress = !result.error && typeof result.answer === 'string' && result.answer.length > 0;
  return { result, progress };
}

async function dispatchDrawAnnotation(call, { activeImage, log, emit, usedColorsForTurn }) {
  // Reject up front when Brain omitted or mangled the bbox. Without this,
  // the canvas silently drops the annotation and Brain has no feedback to
  // retry — it just burns rounds. The error string nudges Brain toward
  // the specific corner(s) it forgot.
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

  // Normalize the color: Brain emits a palette name, the canvas expects
  // a hex. Persist both — name for future used-color tracking, hex for
  // rendering. If Brain skipped the field or gave us a duplicate /
  // unknown name, fall back to the first still-unused palette entry so
  // the mark never collides with an earlier one.
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
    color: resolveAnnotationColor(colorName),
    colorName,
    label: typeof call.args?.label === 'string' ? call.args.label.slice(0, 60) : ''
  };

  // Tighten the bbox using OCR before the UI sees it. Brain may have
  // handed us a loose Eyes-style region; the snap shrinks it to hug the
  // actual printed text. No-op when OCR isn't ready, no OCR lines
  // overlap, or the supplied region is too large to be a single-phrase
  // target.
  if (activeImage) {
    const supplied = [call.args.x1, call.args.y1, call.args.x2, call.args.y2];
    try {
      const snap = await snapAnnotationBbox({
        imageId: activeImage.id,
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
  }
  emit('tool', call);
  return { result: { ok: true }, progress: true };
}
