// Bail if the upstream model stops sending chunks for this long. Without
// this, a stalled OpenRouter / DeepSeek connection wedges the whole turn —
// fetch's signal doesn't fire on idle, only on close. 60s is generous for
// inter-token latency once streaming has started; the very first chunk on a
// cold start can take 10-20s with thinking models, so leave headroom.
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

export default async function* agentChat({
  baseUrl,
  apiKey,
  model,
  messages,
  tools,
  signal,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS
}) {
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!model) throw new Error('model is required');

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    // OpenRouter extension: ask the provider to include the per-call USD
    // cost in the final `usage` block so we can persist it for billing.
    // OpenAI-compat back-ends ignore the field harmlessly.
    usage: { include: true },
    // Disable the reasoning / thinking phase across every back-end we hit.
    // `enable_thinking` is the model-native top-level flag (DeepSeek / Qwen).
    // `reasoning.exclude` is OpenRouter's normalized form.
    // `chat_template_kwargs.enable_thinking` is what LM Studio passes through
    // to Gemma 4's chat template — the only knob that actually silences
    // <think>…</think> spans for Gemma in dev.
    // Sending all three is harmless: each back-end ignores the keys it
    // doesn't know.
    enable_thinking: false,
    reasoning: { exclude: true },
    chat_template_kwargs: { enable_thinking: false }
  };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;

  // Wrap the caller's signal with our own so we can also fire on idle. Caller
  // aborts → our controller aborts → fetch aborts. Idle timer fires → our
  // controller aborts → fetch aborts → we throw a specific timeout error so
  // the caller can distinguish stall from cancellation.
  const aborter = new AbortController();
  let timedOut = false;
  let idleTimer = null;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (!idleTimeoutMs) return;
    idleTimer = setTimeout(() => {
      timedOut = true;
      aborter.abort();
    }, idleTimeoutMs);
  };
  const onUpstreamAbort = () => aborter.abort();
  if (signal) {
    if (signal.aborted) aborter.abort();
    else signal.addEventListener('abort', onUpstreamAbort);
  }

  resetIdle();

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: aborter.signal
    });
  } catch (err) {
    if (idleTimer) clearTimeout(idleTimer);
    if (signal) signal.removeEventListener('abort', onUpstreamAbort);
    if (timedOut) {
      throw new Error(`Brain upstream stalled (no chunk for ${idleTimeoutMs}ms before request started)`);
    }
    throw err;
  }

  if (!res.ok) {
    if (idleTimer) clearTimeout(idleTimer);
    if (signal) signal.removeEventListener('abort', onUpstreamAbort);
    const detail = await res.text().catch(() => '');
    throw new Error(`API ${res.status} from ${endpoint}: ${detail.slice(0, 500)}`);
  }
  if (!res.body) {
    if (idleTimer) clearTimeout(idleTimer);
    if (signal) signal.removeEventListener('abort', onUpstreamAbort);
    throw new Error(`No response body from ${endpoint}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const streamedToolIndexes = new Set();

  try {
    while (true) {
      let value;
      let done;
      try {
        ({ value, done } = await reader.read());
      } catch (err) {
        if (timedOut) {
          throw new Error(`Brain upstream stalled (no chunk for ${idleTimeoutMs}ms)`);
        }
        throw err;
      }
      if (done) break;
      resetIdle();
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
          if (process.env.YTAI_DEBUG_LLM === '1') {
            // eslint-disable-next-line no-console
            console.log('[agentChat] chunk', JSON.stringify(json));
          }
          const choice = json.choices?.[0];
          const delta = choice?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            yield { delta };
          }
          const deltaToolCalls = choice?.delta?.tool_calls;
          if (Array.isArray(deltaToolCalls) && deltaToolCalls.length > 0) {
            for (const tc of deltaToolCalls) streamedToolIndexes.add(tc.index ?? 0);
            yield { toolCallChunks: deltaToolCalls };
          }
          // Fallback: some providers return non-streamed tool calls on the
          // final chunk under choice.message.tool_calls instead of delta.
          // Skip indexes already covered by streamed delta chunks — otherwise
          // their args get concatenated downstream and JSON.parse fails.
          const finalToolCalls = choice?.message?.tool_calls;
          if (Array.isArray(finalToolCalls) && finalToolCalls.length > 0) {
            const normalized = finalToolCalls
              .map((tc, i) => ({
                index: tc.index ?? i,
                id: tc.id,
                type: tc.type,
                function: {
                  name: tc.function?.name,
                  arguments:
                    typeof tc.function?.arguments === 'string'
                      ? tc.function.arguments
                      : JSON.stringify(tc.function?.arguments ?? {})
                }
              }))
              .filter((tc) => !streamedToolIndexes.has(tc.index));
            if (normalized.length > 0) {
              yield { toolCallChunks: normalized };
            }
          }
          if (choice?.finish_reason) {
            yield { finishReason: choice.finish_reason };
          }
          // Many OpenRouter providers emit usage chunks on every delta. The
          // last one wins downstream; yielding all of them is harmless.
          // `json.model` is the provider's resolved model id (often a more
          // specific version than what we requested) — surface it so we
          // can persist it alongside the usage record.
          if (json.usage || json.model) {
            yield { usage: json.usage ?? null, modelVersion: json.model ?? null };
          }
        } catch {
          // keep-alive or malformed chunk; ignore
        }
      }
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    if (signal) signal.removeEventListener('abort', onUpstreamAbort);
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}
