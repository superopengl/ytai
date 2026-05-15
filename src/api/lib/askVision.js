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

// Side length of the square we stretch to before sending. Multiple of 32 to
// align with Qwen3-VL's 32px patch grid. 1536 keeps small handwriting legible
// without ballooning the request payload.
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

  const { dataUrl: squareDataUrl, pixels } = await squareifyImage(imageDataUrl);

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: squareDataUrl },
            // Siblings of image_url — DashScope reads them here. Nested
            // inside image_url and the server silently rescales.
            min_pixels: pixels,
            max_pixels: pixels
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
  const bbox = sanitizeBbox(parsed.bbox);

  return {
    answer,
    bbox,
    usage: json.usage ?? null,
    modelVersion: json.model ?? model
  };
}

async function squareifyImage(imageDataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);
  if (!match) {
    // Unrecognized dataUrl shape — send as-is and skip the pixel lock.
    return { dataUrl: imageDataUrl, pixels: 0 };
  }
  const bytes = Buffer.from(match[2], 'base64');
  const resized = await sharp(bytes)
    .resize(VISION_SQUARE_SIZE, VISION_SQUARE_SIZE, {
      fit: 'fill',
      kernel: 'lanczos3'
    })
    .png()
    .toBuffer();
  return {
    dataUrl: `data:image/png;base64,${resized.toString('base64')}`,
    pixels: VISION_SQUARE_SIZE * VISION_SQUARE_SIZE
  };
}

// Convert Qwen's native 0–1000 [x1, y1, x2, y2] to the 0..1 [x, y, w, h]
// contract the rest of the app (draw_annotation, Konva canvas) expects.
// Because coordinates are relative, the stretch-to-square is invisible here.
function sanitizeBbox(box) {
  if (!Array.isArray(box) || box.length < 4) return null;
  const [x1, y1, x2, y2] = box.map(Number);
  if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) return null;
  const left = Math.min(x1, x2) / 1000;
  const top = Math.min(y1, y2) / 1000;
  const width = Math.abs(x2 - x1) / 1000;
  const height = Math.abs(y2 - y1) / 1000;
  if (width <= 0 || height <= 0) return null;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return [clamp(left), clamp(top), clamp(width), clamp(height)];
}
