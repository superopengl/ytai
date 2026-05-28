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
import { markObjectOrphan } from '../lib/s3.js';

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
        .select({ id: sessionImage.id, storageUrl: sessionImage.storageUrl })
        .from(sessionImage)
        .where(eq(sessionImage.sessionId, sessionId));
      const imageIds = images.map((i) => i.id);

      const docs = await tx
        .select({ sourcePdfUrl: sessionDoc.sourcePdfUrl })
        .from(sessionDoc)
        .where(eq(sessionDoc.sessionId, sessionId));

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

      const orphanUrls = [
        ...images.map((i) => i.storageUrl),
        ...docs.map((d) => d.sourcePdfUrl).filter(Boolean)
      ];
      return { kind: 'ok', orphanUrls };
    });

    if (result.kind === 'notFound') {
      reply.code(404);
      return { error: 'Session not found' };
    }

    // Tag the S3 bytes as orphan after the DB transaction commits. The
    // bucket's tag-filtered lifecycle rule reaps them on the next daily
    // sweep (~24h). Fire-and-forget — a failed tag isn't worth blocking
    // the response on; the DB rows are already gone.
    for (const url of result.orphanUrls) {
      markObjectOrphan(url).catch((err) => {
        request.log.error({ url, err }, 'tutorDeleteSession: orphan tag failed');
      });
    }

    return { ok: true };
  });
}
