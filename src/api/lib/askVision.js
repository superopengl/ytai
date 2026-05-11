// One-shot vision Q&A. Brain calls this via the lookup_on_image tool when it
// needs to know something on the page. The image bytes have any student
// annotations baked in (the canvas exports the flattened stage), so the
// model interprets circles, highlights, and underlines directly.
//
// Returns { answer, bbox?, usage, modelVersion }. bbox is normalized 0..1
// [x, y, w, h] when the question is locational ("where is X") and the model
// chooses to provide it — otherwise null.

const SYSTEM = [
  'You are the "Eyes" of a friendly homework tutor. The image is a photo of a',
  "student's worksheet or exam. The student may have drawn freehand strokes",
  '(circles, underlines, arrows, highlights) on top — those marks indicate',
  'what the student is pointing at and you should interpret them.',
  '',
  "Answer the tutor's question about the page. Be concise (≤ 80 words). If",
  'the question asks where something is on the page, or naming a thing the',
  "tutor will want to point at, include a normalized 0..1 bounding box.",
  '',
  'Return ONLY a JSON object — no prose, no markdown fences:',
  '{',
  '  "answer": string,',
  '  "bbox": [x, y, w, h] | null   // normalized 0..1; null if not locational',
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
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: question }
        ]
      }
    ],
    temperature: 0,
    stream: false
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
    // Model didn't honour the JSON contract — fall back to the raw text so
    // Brain still gets something useful instead of an error.
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

function sanitizeBbox(box) {
  if (!Array.isArray(box) || box.length < 4) return null;
  const [x, y, w, h] = box.map(Number);
  if ([x, y, w, h].some((v) => !Number.isFinite(v))) return null;
  if (w <= 0 || h <= 0) return null;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return [clamp(x), clamp(y), clamp(w), clamp(h)];
}
