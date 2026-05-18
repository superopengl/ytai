import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { tutorSession } from '../db/schema.js';
import { GUIDANCE_LEVELS, isGuidanceLevel } from '../lib/tutorPrompt.js';

export default function tutorUpdateSession(fastify) {
  fastify.patch('/api/tutor/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    const body = request.body ?? {};

    if (!Object.prototype.hasOwnProperty.call(body, 'guidanceLevel')) {
      reply.code(400);
      return { error: 'guidanceLevel is required' };
    }
    if (!isGuidanceLevel(body.guidanceLevel)) {
      reply.code(400);
      return {
        error: `guidanceLevel must be one of: ${GUIDANCE_LEVELS.join(', ')}`
      };
    }

    const [updated] = await db()
      .update(tutorSession)
      .set({ guidanceLevel: body.guidanceLevel, updatedAt: new Date() })
      .where(eq(tutorSession.id, sessionId))
      .returning({ id: tutorSession.id, guidanceLevel: tutorSession.guidanceLevel });

    if (!updated) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    return { sessionId: updated.id, guidanceLevel: updated.guidanceLevel };
  });
}
