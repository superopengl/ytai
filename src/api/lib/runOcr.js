// PaddleOCR client. Calls the OCR sidecar's /ocr-json with raw image bytes
// and returns { modelVersion, width, height, lines }. Lines are sorted top
// to bottom — the order Brain will most naturally walk a worksheet.
//
// The sidecar is optional: if YTAI_OCR_BASE_URL is unset, the caller treats
// it as "OCR unavailable" and falls through to Eyes for everything.

export default async function runOcr({ bytes, baseUrl, apiKey, signal } = {}) {
  if (!bytes || bytes.length === 0) throw new Error('bytes are required');
  if (!baseUrl) throw new Error('baseUrl is required');

  const endpoint = `${baseUrl.replace(/\/$/, '')}/ocr-json`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image_base64: Buffer.from(bytes).toString('base64') }),
    signal
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OCR API ${res.status} from ${endpoint}: ${detail.slice(0, 500)}`);
  }

  const json = await res.json();
  const lines = Array.isArray(json?.lines) ? json.lines : [];
  lines.sort((a, b) => (a?.bbox?.[1] ?? 0) - (b?.bbox?.[1] ?? 0));

  return {
    modelVersion: typeof json.modelVersion === 'string' ? json.modelVersion : 'paddleocr',
    width: Number(json.width) || 0,
    height: Number(json.height) || 0,
    lines: lines.map((l) => ({
      text: typeof l.text === 'string' ? l.text : '',
      confidence: Number(l.confidence) || 0,
      bbox: sanitizeBbox(l.bbox)
    })).filter((l) => l.text && l.bbox)
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
