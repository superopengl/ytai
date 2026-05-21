import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { user } from '../db/schema.js';
import generateSubjectReport, {
  BUILTIN_REPORT_TYPES,
  VALID_SUBJECTS,
  normalizePrompt
} from '../lib/generateSubjectReport.js';

const DEV_USER_NAME = 'dev';

// Best-effort per-user, per-(subject, type, promptHash) in-flight lock so
// that double-clicks don't double-bill OpenRouter.
const inFlight = new Map();

const MAX_CUSTOM_PROMPT_LEN = 1000;

export default function meGenerateSubjectReport(fastify) {
  fastify.post('/api/me/subject-report', async (request, reply) => {
    const body = request.body || {};
    const subject = String(body.subject || '').toLowerCase();
    const reportType = String(body.reportType || '');
    const force = body.force === true || body.force === '1' || body.force === 'true';
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

    const lockKey = `${bootstrapUser.id}:${subject}:${reportType}:${customPrompt ? normalizePrompt(customPrompt) : ''}`;
    let pending = inFlight.get(lockKey);
    if (!pending) {
      pending = generateSubjectReport({
        userId: bootstrapUser.id,
        subject,
        reportType,
        customPrompt: isCustom ? customPrompt : null,
        force,
        log: request.log
      }).finally(() => inFlight.delete(lockKey));
      inFlight.set(lockKey, pending);
    }

    try {
      const result = await pending;
      return result;
    } catch (err) {
      request.log.error({ err, subject, reportType }, 'meGenerateSubjectReport: failed');
      reply.code(502);
      return { error: err.message?.slice(0, 500) || 'Failed to generate report' };
    }
  });
}
