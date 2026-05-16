// One-shot TTS. Brain's text is already streaming to the client; the
// frontend buffers sentences and asks us to synthesize each one. We POST
// to an OpenAI-compatible /audio/speech endpoint — Kokoro-FastAPI in dev,
// any compatible provider in prod — and return the raw audio bytes.
//
// MP3 is the only format we emit. Universal browser support, ~16–24 kbps,
// no MediaSource gymnastics on the frontend.

export default async function synthesizeSpeech({ text, baseUrl, apiKey, model, voice, signal }) {
  if (!text) throw new Error('text is required');
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!model) throw new Error('model is required');
  if (!voice) throw new Error('voice is required');

  const endpoint = `${baseUrl.replace(/\/$/, '')}/audio/speech`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: 'mp3'
    }),
    signal
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`TTS API ${res.status} from ${endpoint}: ${detail.slice(0, 500)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return { bytes: Buffer.from(arrayBuf), contentType: 'audio/mpeg' };
}
