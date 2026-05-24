import enqueueAnalysisReport, {
  VALID_SUBJECTS,
  normalizePrompt
} from '../lib/generateAnalysisReport.js';

const MAX_PROMPT_LEN = 2000;

export default function createAnalysisReport(fastify) {
  fastify.post('/api/analysis-report', async (request, reply) => {
    const body = request.body || {};
    const subject = String(body.subject || '').toLowerCase();
    const prompt = body.prompt ?? null;

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
        log: request.log
      });
    } catch (err) {
      request.log.error({ err, subject }, 'createAnalysisReport: enqueue failed');
      reply.code(502);
      return { error: err.message?.slice(0, 500) || 'Failed to enqueue report' };
    }
  });
}
