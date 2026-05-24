// One-shot vision Q&A. Brain calls this via the lookup_on_image tool when it
// needs to understand something on the page — what the questions are, what
// the student wrote, what a diagram shows. The image bytes have any student
// annotations baked in (the canvas exports the flattened stage), so the
// model interprets circles, highlights, and underlines directly.
//
// Returns { answer, usage, modelVersion }. No bounding box — locating
// printed text on the page is the OCR sidecar's job (find_text_on_image),
// not Eyes'. Eyes only describes what's there.

const SYSTEM = [
  'You are the "Eyes" of a friendly homework tutor.',
  '',
  "Your job is to help the tutor (\"Brain\") understand what's on the student's worksheet —",
  'what the questions are, what the student wrote, what a diagram or figure shows, and',
  'whether an answer looks right. The image may have freehand marks the student drew',
  '(circles, underlines, arrows, highlights) — interpret those as the student pointing',
  'at what they want help with.',
  '',
  "Answer the tutor's question about the page in plain language. Be concise (≤ 80 words),",
  'specific, and faithful to what is actually on the page. If a question on the page is',
  "numbered, keep the numbering. Don't invent content. Don't include coordinates or",
  "bounding boxes — locating things on the page is handled separately by a local OCR step.",
  '',
  'Return ONLY a JSON object — no prose, no markdown fences:',
  '{ "answer": string }'
].join('\n');

export default async function askVisionModel({ imageDataUrl, question, baseUrl, apiKey, model, signal }) {
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
    stream: false,
    // OpenRouter extension: include per-call USD cost in the usage block.
    usage: { include: true },
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'vision_response',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['answer'],
          properties: {
            answer: { type: 'string' }
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
    parsed = { answer: stripped };
  }

  const answer = typeof parsed.answer === 'string' ? parsed.answer : '';

  return {
    answer,
    usage: json.usage ?? null,
    modelVersion: json.model ?? model,
    model
  };
}
