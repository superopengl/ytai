import { asc, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionMessage, tutorSession } from '../db/schema.js';

export default function tutorGetMessages(fastify) {
  fastify.get('/api/tutor/:sessionId/messages', async (request, reply) => {
    const { sessionId } = request.params;

    const [session] = await db()
      .select({ id: tutorSession.id })
      .from(tutorSession)
      .where(eq(tutorSession.id, sessionId));

    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const messages = await db()
      .select({
        id: sessionMessage.id,
        role: sessionMessage.role,
        content: sessionMessage.content,
        interrupted: sessionMessage.interrupted,
        toolCalls: sessionMessage.toolCalls,
        createdAt: sessionMessage.createdAt
      })
      .from(sessionMessage)
      .where(eq(sessionMessage.sessionId, sessionId))
      .orderBy(asc(sessionMessage.createdAt));

    return { messages };
  });
}
