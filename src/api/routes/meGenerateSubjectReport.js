import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { user } from '../db/schema.js';
import enqueueSubjectReport, {
  BUILTIN_REPORT_TYPES,
  VALID_SUBJECTS,
  normalizePrompt
} from '../lib/generateSubjectReport.js';

const DEV_USER_NAME = 'dev';

const MAX_CUSTOM_PROMPT_LEN = 2000;

export default function meGenerateSubjectReport(fastify) {
  fastify.post('/api/me/subject-report', async (request, reply) => {
    const body = request.body || {};
    const subject = String(body.subject || '').toLowerCase();
    const reportType = String(body.reportType || '');
    const customPrompt = body.customPrompt ?? null;

    if (!VALID_SUBJECTS.has(subject)) {
      reply.code(400);
      return { error: `Invalid subject. Must be one of: math, thinking, reading, writing.` };
    }

    const isCustom = reportType === 'custom';
    if (!isCustom && !BUILTIN_REPORT_TYPES.has(reportType)) {
      reply.code(400);
      return {
        error: `Invalid reportType. Must be one of: wrong_questions, strengths_weaknesses, curriculum_map, custom.`
      };
    }
    if (isCustom) {
      const normalized = normalizePrompt(customPrompt);
      if (!normalized) {
        reply.code(400);
        return { error: 'customPrompt is required for custom reports.' };
      }
      if (normalized.length > MAX_CUSTOM_PROMPT_LEN) {
        reply.code(400);
        return { error: `customPrompt must be ${MAX_CUSTOM_PROMPT_LEN} characters or fewer.` };
      }
    }

    const [bootstrapUser] = await db()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.name, DEV_USER_NAME));
    if (!bootstrapUser) {
      reply.code(404);
      return { error: 'User not found' };
    }

    try {
      // Returns as soon as the pending row is inserted; the actual
      // rollup work happens in a background task. The client picks the
      // pending row up via GET /api/me/subject-reports and polls until
      // it transitions to 'ready' or 'failed'.
      return await enqueueSubjectReport({
        userId: bootstrapUser.id,
        subject,
        reportType,
        customPrompt: isCustom ? customPrompt : null,
        log: request.log
      });
    } catch (err) {
      request.log.error({ err, subject, reportType }, 'meGenerateSubjectReport: enqueue failed');
      reply.code(502);
      return { error: err.message?.slice(0, 500) || 'Failed to enqueue report' };
    }
  });
}
