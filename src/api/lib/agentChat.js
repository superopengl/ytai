export default async function* agentChat({ baseUrl, apiKey, model, messages, tools, signal }) {
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
    // Skip the reasoning phase. deepseek-v4-flash and other thinking models
    // burn wall-clock streaming reasoning_content before any user text.
    // enable_thinking is the model-native flag (DeepSeek / Qwen);
    // reasoning.exclude is OpenRouter's normalized form. Sending both is
    // harmless — providers that don't recognize one ignore it.
    enable_thinking: false,
    reasoning: { exclude: true }
  };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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
  const streamedToolIndexes = new Set();

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
          if (process.env.YTAI_DEBUG_LLM === '1') {
            // eslint-disable-next-line no-console
            console.log('[agentChat] chunk', JSON.stringify(json));
          }
          const choice = json.choices?.[0];
          const delta = choice?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            yield { delta };
          }
          // Reasoning models (deepseek-v4-flash, deepseek-r1, etc.) stream
          // their chain-of-thought under delta.reasoning_content. Surface it
          // as a separate channel so the caller can log it or show a
          // "thinking…" trail — otherwise a long reasoning phase looks like
          // a frozen stream.
          const reasoning =
            choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
          if (typeof reasoning === 'string' && reasoning.length > 0) {
            yield { reasoning };
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
