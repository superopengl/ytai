import { and, eq, inArray } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import {
  imageOcr,
  sessionDoc,
  sessionImage,
  sessionMessage,
  sessionReport,
  tutorSession,
  visionExtraction
} from '../db/schema.js';

export default function tutorDeleteSession(fastify) {
  fastify.delete('/api/tutor/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    const userId = request.userId;

    const result = await withTx(async (tx) => {
      const [session] = await tx
        .select({ id: tutorSession.id })
        .from(tutorSession)
        .where(and(eq(tutorSession.id, sessionId), eq(tutorSession.userId, userId)));

      if (!session) return { kind: 'notFound' };

      const images = await tx
        .select({ id: sessionImage.id })
        .from(sessionImage)
        .where(eq(sessionImage.sessionId, sessionId));
      const imageIds = images.map((i) => i.id);

      await tx.delete(sessionMessage).where(eq(sessionMessage.sessionId, sessionId));
      if (imageIds.length > 0) {
        await tx.delete(imageOcr).where(inArray(imageOcr.imageId, imageIds));
        await tx.delete(visionExtraction).where(inArray(visionExtraction.imageId, imageIds));
      }
      // current_doc_id references session_doc, which references session_image;
      // null the pointer first so FK chains unwind in safe order.
      await tx
        .update(tutorSession)
        .set({ currentDocId: null })
        .where(eq(tutorSession.id, sessionId));
      await tx.delete(sessionImage).where(eq(sessionImage.sessionId, sessionId));
      await tx.delete(sessionDoc).where(eq(sessionDoc.sessionId, sessionId));
      await tx.delete(sessionReport).where(eq(sessionReport.sessionId, sessionId));
      await tx.delete(tutorSession).where(eq(tutorSession.id, sessionId));

      return { kind: 'ok' };
    });

    if (result.kind === 'notFound') {
      reply.code(404);
      return { error: 'Session not found' };
    }
    return { ok: true };
  });
}
