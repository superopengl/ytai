import enqueueAnalysisReport, {
  VALID_SUBJECTS,
  VALID_TIMESPAN_DAYS,
  normalizePrompt
} from '../lib/generateAnalysisReport.js';

const MAX_PROMPT_LEN = 2000;

export default function createAnalysisReport(fastify) {
  fastify.post('/api/analysis-report', async (request, reply) => {
    const body = request.body || {};
    const subject = String(body.subject || '').toLowerCase();
    const prompt = body.prompt ?? null;
    // null / undefined → no time filter (all sessions). Otherwise must be
    // one of the explicit windows the UI offers; reject anything else so
    // a malformed client can't fish for arbitrary date ranges.
    const rawTimespan = body.timespanDays;
    let timespanDays = null;
    if (rawTimespan !== null && rawTimespan !== undefined) {
      if (!VALID_TIMESPAN_DAYS.has(rawTimespan)) {
        reply.code(400);
        return {
          error: `Invalid timespanDays. Must be one of: ${[...VALID_TIMESPAN_DAYS].join(', ')}, or null for all sessions.`
        };
      }
      timespanDays = rawTimespan;
    }

    if (!VALID_SUBJECTS.has(subject)) {
      reply.code(400);
      return { error: `Invalid subject. Must be one of: math, thinking, reading, writing.` };
    }

    const normalized = normalizePrompt(prompt);
    if (!normalized) {
      reply.code(400);
      return { error: 'prompt is required.' };
    }
    if (normalized.length > MAX_PROMPT_LEN) {
      reply.code(400);
      return { error: `prompt must be ${MAX_PROMPT_LEN} characters or fewer.` };
    }

    try {
      // Returns as soon as the pending row is inserted; the actual
      // rollup work happens in a background task. The client picks the
      // pending row up via GET /api/analysis-reports and polls until
      // it transitions to 'ready' or 'failed'.
      return await enqueueAnalysisReport({
        userId: request.userId,
        subject,
        prompt: normalized,
        timespanDays,
        log: request.log
      });
    } catch (err) {
      request.log.error({ err, subject }, 'createAnalysisReport: enqueue failed');
      reply.code(502);
      return { error: err.message?.slice(0, 500) || 'Failed to enqueue report' };
    }
  });
}
