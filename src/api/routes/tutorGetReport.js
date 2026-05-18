import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionReport, tutorSession } from '../db/schema.js';
import generateSessionReport from '../lib/generateSessionReport.js';

// In-flight generation locks per sessionId. Two parents hitting the report
// at once shouldn't double-bill OpenRouter — the second request awaits the
// first.
const inFlight = new Map();

export default function tutorGetReport(fastify) {
  fastify.get('/api/tutor/:sessionId/report', async (request, reply) => {
    const { sessionId } = request.params;
    const force = request.query?.force === '1' || request.query?.force === 'true';

    const [session] = await db()
      .select({ id: tutorSession.id })
      .from(tutorSession)
      .where(eq(tutorSession.id, sessionId));
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    if (!force) {
      const [existing] = await db()
        .select({
          status: sessionReport.status,
          summary: sessionReport.summary,
          questions: sessionReport.questions,
          modelVersion: sessionReport.modelVersion,
          error: sessionReport.error,
          updatedAt: sessionReport.updatedAt
        })
        .from(sessionReport)
        .where(eq(sessionReport.sessionId, sessionId));
      if (existing && existing.status === 'ready') {
        return {
          status: 'ready',
          summary: existing.summary || '',
          questions: Array.isArray(existing.questions) ? existing.questions : [],
          modelVersion: existing.modelVersion,
          updatedAt: existing.updatedAt
        };
      }
    }

    let pending = inFlight.get(sessionId);
    if (!pending) {
      pending = generateSessionReport({ sessionId, log: request.log }).finally(() => {
        inFlight.delete(sessionId);
      });
      inFlight.set(sessionId, pending);
    }

    try {
      const result = await pending;
      return {
        status: 'ready',
        summary: result.summary,
        subject: result.subject,
        stage: result.stage,
        questions: result.questions
      };
    } catch (err) {
      request.log.error({ err, sessionId }, 'tutorGetReport: generation failed');
      reply.code(502);
      return {
        status: 'failed',
        error: err.message?.slice(0, 500) || 'Failed to generate report'
      };
    }
  });
}
