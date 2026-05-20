import { eq, inArray } from 'drizzle-orm';
import db from '../db/index.js';
import {
  imageOcr,
  sessionImage,
  sessionMessage,
  sessionReport,
  tutorSession,
  visionExtraction
} from '../db/schema.js';

export default function tutorDeleteSession(fastify) {
  fastify.delete('/api/tutor/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;

    const [session] = await db()
      .select({ id: tutorSession.id })
      .from(tutorSession)
      .where(eq(tutorSession.id, sessionId));

    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const images = await db()
      .select({ id: sessionImage.id })
      .from(sessionImage)
      .where(eq(sessionImage.sessionId, sessionId));
    const imageIds = images.map((i) => i.id);

    await db().delete(sessionMessage).where(eq(sessionMessage.sessionId, sessionId));
    if (imageIds.length > 0) {
      await db().delete(imageOcr).where(inArray(imageOcr.imageId, imageIds));
      await db().delete(visionExtraction).where(inArray(visionExtraction.imageId, imageIds));
    }
    await db().delete(sessionImage).where(eq(sessionImage.sessionId, sessionId));
    await db().delete(sessionReport).where(eq(sessionReport.sessionId, sessionId));
    await db().delete(tutorSession).where(eq(tutorSession.id, sessionId));

    return { ok: true };
  });
}
