const EXTRACTION_PROMPT = [
  'You are a worksheet-reading assistant. Look at the page and return ONLY a JSON object — no prose, no markdown fences.',
  '',
  'Schema:',
  '{',
  '  "page_summary": string,         // one short sentence: subject, topic, approx item count',
  '  "student_focus": string | null, // if freehand strokes (circles/underlines) are drawn over the page, describe what the student is pointing at; otherwise null',
  '  "items": [',
  '    {',
  '      "id": string,               // stable id like "q1", "q2"',
  '      "type": "question" | "answer" | "instruction" | "diagram" | "other",',
  '      "text": string,             // the printed text, OCR\'d',
  '      "student_answer": string | null,',
  '      "correctness": "correct" | "wrong" | "blank" | "unknown",',
  '      "teacher_marks": string | null, // describe red Xs, ticks, written feedback if any',
  '      "box": [x, y, w, h]         // normalized 0..1 relative to image; top-left origin',
  '    }',
  '  ]',
  '}',
  '',
  'Bounding boxes MUST be normalized 0..1. If unsure of a value, take your best guess; never omit box.',
  'Freehand strokes drawn ON TOP of the page are the student\'s annotations and are NOT printed content — describe them in student_focus, do not list them as items.',
  'Return valid JSON. Do not wrap in code fences.'
].join('\n');

export default async function extractVision({ imageDataUrl, baseUrl, apiKey, model, signal }) {
  if (!imageDataUrl) throw new Error('imageDataUrl is required');
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!model) throw new Error('model is required');

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: EXTRACTION_PROMPT }
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
  } catch (err) {
    throw new Error(`Vision response was not JSON: ${err.message}; head=${stripped.slice(0, 200)}`);
  }

  return {
    extracted: parsed,
    usage: json.usage ?? null,
    modelVersion: json.model ?? model
  };
}
