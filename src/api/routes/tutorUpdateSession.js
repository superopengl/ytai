import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { tutorSession } from '../db/schema.js';
import { GUIDANCE_LEVELS, isGuidanceLevel } from '../lib/tutorPrompt.js';
import isSubject, { SUBJECTS } from '../lib/tutorSubject.js';

export default function tutorUpdateSession(fastify) {
  fastify.patch('/api/tutor/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    const body = request.body ?? {};
    const hasGuidance = Object.prototype.hasOwnProperty.call(body, 'guidanceLevel');
    const hasSubject = Object.prototype.hasOwnProperty.call(body, 'subject');

    if (!hasGuidance && !hasSubject) {
      reply.code(400);
      return { error: 'guidanceLevel or subject is required' };
    }
    if (hasGuidance && !isGuidanceLevel(body.guidanceLevel)) {
      reply.code(400);
      return { error: `guidanceLevel must be one of: ${GUIDANCE_LEVELS.join(', ')}` };
    }
    if (hasSubject && !isSubject(body.subject)) {
      reply.code(400);
      return { error: `subject must be one of: ${SUBJECTS.join(', ')}` };
    }

    const patch = { updatedAt: new Date() };
    if (hasGuidance) patch.guidanceLevel = body.guidanceLevel;
    if (hasSubject) patch.subject = body.subject;

    const [updated] = await db()
      .update(tutorSession)
      .set(patch)
      .where(eq(tutorSession.id, sessionId))
      .returning({
        id: tutorSession.id,
        guidanceLevel: tutorSession.guidanceLevel,
        subject: tutorSession.subject
      });

    if (!updated) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    return {
      sessionId: updated.id,
      guidanceLevel: updated.guidanceLevel,
      subject: updated.subject
    };
  });
}
