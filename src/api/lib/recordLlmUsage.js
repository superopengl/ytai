import db from '../db/index.js';
import { llmUsage } from '../db/schema.js';

// Normalises a provider `usage` object into the columns of llm_usage.
// Returns null when the upstream gave us nothing to record (in which case
// the caller should skip the insert entirely — an empty row would distort
// billing aggregates).
//
// Field map (OpenAI / OpenRouter shape — what DeepSeek-via-OpenRouter and
// most other providers emit):
//   prompt_tokens                              → inputTokens
//   completion_tokens                          → outputTokens
//   total_tokens                               → totalTokens
//   prompt_tokens_details.cached_tokens        → cacheReadTokens
//   prompt_tokens_details.cache_write_tokens   → cacheWriteTokens
//   completion_tokens_details.reasoning_tokens → reasoningTokens
//   cost                                       → costUsd (OpenRouter)
//
// Anthropic-native fallbacks (in case we ever go direct):
//   cache_read_input_tokens                    → cacheReadTokens
//   cache_creation_input_tokens                → cacheWriteTokens
export function normaliseUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const inputTokens = Number.isFinite(raw.prompt_tokens) ? raw.prompt_tokens : 0;
  const outputTokens = Number.isFinite(raw.completion_tokens) ? raw.completion_tokens : 0;
  const totalTokens = Number.isFinite(raw.total_tokens)
    ? raw.total_tokens
    : inputTokens + outputTokens;
  const cacheReadTokens = Number.isFinite(raw.prompt_tokens_details?.cached_tokens)
    ? raw.prompt_tokens_details.cached_tokens
    : Number.isFinite(raw.cache_read_input_tokens)
      ? raw.cache_read_input_tokens
      : 0;
  const cacheWriteTokens = Number.isFinite(raw.prompt_tokens_details?.cache_write_tokens)
    ? raw.prompt_tokens_details.cache_write_tokens
    : Number.isFinite(raw.cache_creation_input_tokens)
      ? raw.cache_creation_input_tokens
      : 0;
  const reasoningTokens = Number.isFinite(raw.completion_tokens_details?.reasoning_tokens)
    ? raw.completion_tokens_details.reasoning_tokens
    : 0;
  const costUsd = Number.isFinite(raw.cost) ? String(raw.cost) : null;
  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    totalTokens === 0 &&
    cacheReadTokens === 0 &&
    cacheWriteTokens === 0 &&
    reasoningTokens === 0 &&
    costUsd === null
  ) {
    return null;
  }
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    costUsd
  };
}

// Sum a list of normalised usage records into a single aggregate. Used to
// fold every chat / vision call that contributed to one assistant message
// (or report row) into the denormalised columns we cache on that entity.
export function sumUsage(normalised) {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUsd: null
  };
  for (const u of normalised) {
    if (!u) continue;
    totals.inputTokens += u.inputTokens;
    totals.outputTokens += u.outputTokens;
    totals.reasoningTokens += u.reasoningTokens;
    totals.cacheReadTokens += u.cacheReadTokens;
    totals.cacheWriteTokens += u.cacheWriteTokens;
    totals.totalTokens += u.totalTokens;
    if (u.costUsd !== null) {
      const n = Number(u.costUsd);
      if (Number.isFinite(n)) {
        totals.costUsd = totals.costUsd === null ? n : totals.costUsd + n;
      }
    }
  }
  if (totals.costUsd !== null) totals.costUsd = String(totals.costUsd);
  return totals;
}

// Insert one row into llm_usage. Best-effort: a billing record is nice to
// have, but the user-facing turn has already happened by the time we get
// here — never crash the request just because the audit insert failed.
//
// `purpose` is one of: brain_chat | vision_lookup | session_report |
// subject_report | subject_report_title. The FK fields are mutually
// optional — set whichever ones identify the originating entity.
export default async function recordLlmUsage({
  userId = null,
  sessionId = null,
  messageId = null,
  imageId = null,
  sessionReportId = null,
  subjectReportId = null,
  purpose,
  provider = 'openrouter',
  model,
  modelVersion = null,
  usage,
  log
}) {
  const normalised = normaliseUsage(usage);
  if (!normalised) return null;
  try {
    const [row] = await db()
      .insert(llmUsage)
      .values({
        userId,
        sessionId,
        messageId,
        imageId,
        sessionReportId,
        subjectReportId,
        purpose,
        provider,
        model,
        modelVersion,
        inputTokens: normalised.inputTokens,
        outputTokens: normalised.outputTokens,
        reasoningTokens: normalised.reasoningTokens,
        cacheReadTokens: normalised.cacheReadTokens,
        cacheWriteTokens: normalised.cacheWriteTokens,
        totalTokens: normalised.totalTokens,
        costUsd: normalised.costUsd,
        usageRaw: usage ?? null
      })
      .returning({ id: llmUsage.id });
    return { id: row.id, ...normalised };
  } catch (err) {
    log?.warn(
      { err: err.message, purpose, model, userId, sessionId, messageId },
      'recordLlmUsage: insert failed'
    );
    return null;
  }
}
