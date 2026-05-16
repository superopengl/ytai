// One-shot vision Q&A. Brain calls this via the lookup_on_image tool when it
// needs to know something on the page. The image bytes have any student
// annotations baked in (the canvas exports the flattened stage), so the
// model interprets circles, highlights, and underlines directly.
//
// Returns { answer, bbox?, usage, modelVersion }. bbox is normalized 0..1
// [x, y, w, h] when the question is locational ("where is X") and the model
// chooses to provide it — otherwise null.
//
// Preprocessing notes (Qwen3-VL bbox accuracy):
//   1. The photo is stretched (not padded) to a square whose side is a
//      multiple of 32. Qwen3-VL processes patches in 32px blocks; non-square
//      input causes Y-axis drift. Since coords are relative, stretching does
//      not require post-conversion.
//   2. min_pixels == max_pixels is sent as a sibling of image_url so the
//      DashScope server cannot silently downscale. LM Studio ignores the
//      params, so the same body works for both backends.
//   3. The model is asked for native 0–1000 [x1,y1,x2,y2] coordinates and we
//      convert to 0..1 [x,y,w,h] on the way out — asking the model to do the
//      normalization itself drifts.

import sharp from 'sharp';

// Fixed square side, multiple of Qwen3-VL's 32px patch grid (16×16 patches
// with spatial_merge_size=2). Letting this vary per image shifts the
// model's spatial prior between turns — keep it constant.
const VISION_SQUARE_SIZE = 1536;

const SYSTEM = [
  'You are the "Eyes" of a friendly homework tutor. The image is a photo of a',
  "student's worksheet or exam, stretched to a square. The student may have",
  'drawn freehand strokes (circles, underlines, arrows, highlights) on top —',
  'those marks indicate what the student is pointing at and you should',
  'interpret them.',
  '',
  "Answer the tutor's question about the page. Be concise (≤ 80 words). If",
  'the question asks where something is on the page, or names a thing the',
  'tutor will want to point at, include a bounding box in the image\'s native',
  '0–1000 coordinate system as [x1, y1, x2, y2] (top-left + bottom-right).',
  '',
  'Return ONLY a JSON object — no prose, no markdown fences:',
  '{',
  '  "answer": string,',
  '  "bbox": [x1, y1, x2, y2] | null   // 0–1000 native; null if not locational',
  '}'
].join('\n');

export default async function askVision({ imageDataUrl, question, baseUrl, apiKey, model, signal }) {
  if (!imageDataUrl) throw new Error('imageDataUrl is required');
  if (!question) throw new Error('question is required');
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!model) throw new Error('model is required');

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const square = await fitToSquare(imageDataUrl);

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: square.dataUrl },
            // Siblings of image_url — DashScope reads them here. Nested
            // inside image_url and the server silently rescales.
            min_pixels: square.pixels,
            max_pixels: square.pixels
          },
          { type: 'text', text: question }
        ]
      }
    ],
    temperature: 0,
    stream: false,
    enable_thinking: false,
    // json_schema works on both LM Studio and OpenRouter; LM Studio rejects
    // the looser 'json_object' form with a 400.
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'vision_response',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['answer', 'bbox'],
          properties: {
            answer: { type: 'string' },
            bbox: {
              anyOf: [
                {
                  type: 'array',
                  items: { type: 'number' },
                  minItems: 4,
                  maxItems: 4
                },
                { type: 'null' }
              ]
            }
          }
        }
      }
    },
    // max_tokens: 32768
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Vision API ${res.status} from ${endpoint}: ${detail.slice(0, 500)}`);
  }

  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') {
    throw new Error('Vision response missing message.content');
  }

  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    parsed = { answer: stripped, bbox: null };
  }

  const answer = typeof parsed.answer === 'string' ? parsed.answer : '';
  const bbox = sanitizeBbox(parsed.bbox, square);

  return {
    answer,
    bbox,
    usage: json.usage ?? null,
    modelVersion: json.model ?? model
  };
}

// Resize the original to fit inside a fixed-size square preserving aspect
// ratio, then white-pad to fill the square. The model sees a true-aspect
// image (no Y-axis squash on tall photos) and we keep the explicit
// pad/scale numbers so sanitizeBbox can map padded-square coords back to
// the original. For already-square inputs, padding is zero — behavior
// matches the previous pure stretch.
async function fitToSquare(imageDataUrl) {
  const identity = {
    dataUrl: imageDataUrl,
    pixels: 0,
    fitW: VISION_SQUARE_SIZE,
    fitH: VISION_SQUARE_SIZE,
    padLeft: 0,
    padTop: 0
  };
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);
  if (!match) return identity;
  const bytes = Buffer.from(match[2], 'base64');

  const meta = await sharp(bytes).metadata();
  const origW = meta.width || VISION_SQUARE_SIZE;
  const origH = meta.height || VISION_SQUARE_SIZE;
  const scale = VISION_SQUARE_SIZE / Math.max(origW, origH);
  const fitW = Math.max(1, Math.round(origW * scale));
  const fitH = Math.max(1, Math.round(origH * scale));
  const padLeft = Math.floor((VISION_SQUARE_SIZE - fitW) / 2);
  const padTop = Math.floor((VISION_SQUARE_SIZE - fitH) / 2);

  const resized = await sharp(bytes)
    .resize(fitW, fitH, { kernel: 'lanczos3' })
    .extend({
      top: padTop,
      bottom: VISION_SQUARE_SIZE - fitH - padTop,
      left: padLeft,
      right: VISION_SQUARE_SIZE - fitW - padLeft,
      background: { r: 255, g: 255, b: 255 }
    })
    .png()
    .toBuffer();

  return {
    dataUrl: `data:image/png;base64,${resized.toString('base64')}`,
    pixels: VISION_SQUARE_SIZE * VISION_SQUARE_SIZE,
    fitW,
    fitH,
    padLeft,
    padTop
  };
}

// Convert Qwen's 0–1000 [x1, y1, x2, y2] (output in *padded-square* space)
// back to the 0..1 [x, y, w, h] contract used by draw_annotation / Konva,
// which addresses the ORIGINAL un-padded image. We first project model
// coords into pixel space inside the square, subtract the pad we added,
// then renormalize by the resized-image dimensions (which share the
// original aspect ratio).
function sanitizeBbox(box, square) {
  if (!Array.isArray(box) || box.length < 4) return null;
  const [x1, y1, x2, y2] = box.map(Number);
  if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) return null;
  const { fitW, fitH, padLeft, padTop } = square;
  const toX = (v) => ((v / 1000) * VISION_SQUARE_SIZE - padLeft) / fitW;
  const toY = (v) => ((v / 1000) * VISION_SQUARE_SIZE - padTop) / fitH;
  const left = Math.min(toX(x1), toX(x2));
  const top = Math.min(toY(y1), toY(y2));
  const width = Math.abs(toX(x2) - toX(x1));
  const height = Math.abs(toY(y2) - toY(y1));
  if (width <= 0 || height <= 0) return null;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return [clamp(left), clamp(top), clamp(width), clamp(height)];
}
