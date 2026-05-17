// One-shot vision Q&A. Brain calls this via the lookup_on_image tool when it
// needs to know something on the page. The image bytes have any student
// annotations baked in (the canvas exports the flattened stage), so the
// model interprets circles, highlights, and underlines directly.
//
// Returns { answer, bbox?, rawBbox?, usage, modelVersion }. bbox is
// normalized 0..1 [x1, y1, x2, y2] — top-left + bottom-right corners,
// against the original image — when the question is locational and the
// model chooses to provide one. rawBbox is the array exactly as the
// model returned it (handy for debugging clamp/order edge cases).
//
// GPT-5 reads coordinates against the original image directly — no padded-
// square preprocessing, no native 0–1000 scale, no min/max pixel hints.
// (Those were Qwen3-VL workarounds.) We send the image as-is and ask for
// normalized 0..1 corners in the response; the corner format is the
// canonical bbox shape used throughout the system.

const SYSTEM = [
  'You are the "Eyes" of a friendly homework tutor. The image is a photo of a',
  "student's worksheet or exam. The student may have drawn freehand strokes",
  '(circles, underlines, arrows, highlights) on top — those marks indicate',
  'what the student is pointing at and you should interpret them.',
  '',
  "Answer the tutor's question about the page. Be concise (≤ 80 words). If",
  'the question asks where something is on the page, or names a thing the',
  'tutor will want to point at, include a bounding box in original image, and original image dimentions',
  "Coordinates are normalized numbers between 0 and 1 based on the original image's dimensions.",
  '',
  'Return ONLY a JSON object — no prose, no markdown fences:',
  '{',
  '  "answer": string,',
  '  "size": {width, height},',
  '  "bbox": [x1, y1, x2, y2] | null   // each value 0..1, or null if not locational',
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

  const body = {
    model,
    messages: [
      // { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: 'You are a precise spatial OCR engine. Detect the text in the image. Return the text and its bounding box. Normalize all coordinates to a scale of 0 to 1000, where [0, 0] is top-left and [1000, 1000] is bottom-right. Output strictly in the requested JSON schema format.' + question + '.Do not resize the image. Use normalized coordinaates, tight bbox. Exact text span only. Including the original image dimensions' }
        ]
      }
    ],
    temperature: 0,
    stream: false,
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
    }
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
  const rawBbox = parsed.bbox ?? null;
  const bbox = sanitizeCornerBbox(rawBbox);

  return {
    answer,
    bbox,
    rawBbox,
    usage: json.usage ?? null,
    modelVersion: json.model ?? model
  };
}

// Normalize the model's [x1, y1, x2, y2] (each 0..1, against the original
// image) into a clean, ordered corner bbox. Clamps to [0, 1], reorders
// reversed corners, and rejects zero-area boxes.
function sanitizeCornerBbox(box) {
  if (!Array.isArray(box) || box.length < 4) return null;
  const [a, b, c, d] = box.map(Number);
  if ([a, b, c, d].some((v) => !Number.isFinite(v))) return null;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const x1 = clamp(Math.min(a, c));
  const y1 = clamp(Math.min(b, d));
  const x2 = clamp(Math.max(a, c));
  const y2 = clamp(Math.max(b, d));
  if (x2 <= x1 || y2 <= y1) return null;
  return [x1, y1, x2, y2];
}
