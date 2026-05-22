import { and, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionDoc, tutorSession } from '../db/schema.js';
import { GUIDANCE_LEVELS, isGuidanceLevel } from '../lib/tutorPrompt.js';
import isSubject, { SUBJECTS } from '../lib/tutorSubject.js';

export default function tutorUpdateSession(fastify) {
  fastify.patch('/api/tutor/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    const userId = request.userId;
    const body = request.body ?? {};
    const hasGuidance = Object.prototype.hasOwnProperty.call(body, 'guidanceLevel');
    const hasSubject = Object.prototype.hasOwnProperty.call(body, 'subject');
    const hasCurrentDoc = Object.prototype.hasOwnProperty.call(body, 'currentDocId');

    if (!hasGuidance && !hasSubject && !hasCurrentDoc) {
      reply.code(400);
      return { error: 'guidanceLevel, subject, or currentDocId is required' };
    }
    if (hasGuidance && !isGuidanceLevel(body.guidanceLevel)) {
      reply.code(400);
      return { error: `guidanceLevel must be one of: ${GUIDANCE_LEVELS.join(', ')}` };
    }
    if (hasSubject && !isSubject(body.subject)) {
      reply.code(400);
      return { error: `subject must be one of: ${SUBJECTS.join(', ')}` };
    }
    if (hasCurrentDoc && body.currentDocId !== null) {
      if (typeof body.currentDocId !== 'string' || body.currentDocId.length === 0) {
        reply.code(400);
        return { error: 'currentDocId must be a uuid string or null' };
      }
      // Make sure the doc belongs to this session so a client can't point at
      // another user's doc.
      const [doc] = await db()
        .select({ id: sessionDoc.id })
        .from(sessionDoc)
        .where(and(eq(sessionDoc.id, body.currentDocId), eq(sessionDoc.sessionId, sessionId)));
      if (!doc) {
        reply.code(404);
        return { error: 'Doc not found in this session' };
      }
    }

    const patch = { updatedAt: new Date() };
    if (hasGuidance) patch.guidanceLevel = body.guidanceLevel;
    if (hasSubject) patch.subject = body.subject;
    if (hasCurrentDoc) patch.currentDocId = body.currentDocId;

    const [updated] = await db()
      .update(tutorSession)
      .set(patch)
      .where(and(eq(tutorSession.id, sessionId), eq(tutorSession.userId, userId)))
      .returning({
        id: tutorSession.id,
        guidanceLevel: tutorSession.guidanceLevel,
        subject: tutorSession.subject,
        currentDocId: tutorSession.currentDocId
      });

    if (!updated) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    return {
      sessionId: updated.id,
      guidanceLevel: updated.guidanceLevel,
      subject: updated.subject,
      currentDocId: updated.currentDocId
    };
  });
}
