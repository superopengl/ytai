export default async function* openaiChat({ baseUrl, apiKey, model, messages, signal }) {
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!model) throw new Error('model is required');

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true }
    }),
    signal
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`API ${res.status} from ${endpoint}: ${detail.slice(0, 500)}`);
  }
  if (!res.body) throw new Error(`No response body from ${endpoint}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const data = dataLine.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            yield { delta };
          }
          if (json.usage) {
            yield { usage: json.usage };
          }
        } catch {
          // keep-alive or malformed chunk; ignore
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}
