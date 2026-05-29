// EasyOCR client. Calls the OCR sidecar's /ocr-json with raw image bytes
// and returns { modelVersion, width, height, lines }. Lines are sorted top
// to bottom — the order Brain will most naturally walk a worksheet.
//
// The sidecar is optional: if YTAI_OCR_BASE_URL is unset, the caller treats
// it as "OCR unavailable" and falls through to Eyes for everything.

// Hard wall-clock cap on a single OCR call. EasyOCR on CPU is ~3-8s per
// page; 30s covers a worst-case dense page without letting a wedged
// sidecar pin the image Buffer in memory indefinitely.
const DEFAULT_TIMEOUT_MS = 30_000;

export default async function runOcr({ bytes, baseUrl, apiKey, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!bytes || bytes.length === 0) throw new Error('bytes are required');
  if (!baseUrl) throw new Error('baseUrl is required');

  const endpoint = `${baseUrl.replace(/\/$/, '')}/ocr-json`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  // Compose caller's signal with our own deadline so a hung sidecar can't
  // hold the fetch (and the closure that captured `bytes`) forever.
  const aborter = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    aborter.abort();
  }, timeoutMs);
  const onUpstreamAbort = () => aborter.abort();
  if (signal) {
    if (signal.aborted) aborter.abort();
    else signal.addEventListener('abort', onUpstreamAbort);
  }

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ image_base64: Buffer.from(bytes).toString('base64') }),
      signal: aborter.signal
    });
  } catch (err) {
    if (timedOut) throw new Error(`OCR sidecar timed out after ${timeoutMs}ms at ${endpoint}`);
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onUpstreamAbort);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OCR API ${res.status} from ${endpoint}: ${detail.slice(0, 500)}`);
  }

  const json = await res.json();
  const lines = Array.isArray(json?.lines) ? json.lines : [];
  lines.sort((a, b) => (a?.bbox?.[1] ?? 0) - (b?.bbox?.[1] ?? 0));

  return {
    modelVersion: typeof json.modelVersion === 'string' ? json.modelVersion : 'easyocr',
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
