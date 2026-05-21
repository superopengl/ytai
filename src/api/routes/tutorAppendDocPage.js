import { and, eq, sql } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionDoc, sessionImage, tutorSession } from '../db/schema.js';
import { persistOnePage } from './tutorCreateDoc.js';

// Append one image as the next page of an existing doc. Used by the
// "+ add page" affordance on a doc bubble, e.g. when the student
// realizes they forgot to capture page 3.
//
// Body: { image: { dataUrl, width, height } }
// Returns: { page: { id, pageNumber, width, height } }
export default function tutorAppendDocPage(fastify) {
  fastify.post('/api/tutor/:sessionId/doc/:docId/page', async (request, reply) => {
    const { sessionId, docId } = request.params;
    const image = request.body?.image;

    if (!image || typeof image.dataUrl !== 'string') {
      reply.code(400);
      return { error: 'image.dataUrl is required' };
    }

    const [doc] = await db()
      .select({ id: sessionDoc.id, sessionId: sessionDoc.sessionId, pageCount: sessionDoc.pageCount })
      .from(sessionDoc)
      .where(and(eq(sessionDoc.id, docId), eq(sessionDoc.sessionId, sessionId)));
    if (!doc) {
      reply.code(404);
      return { error: 'Doc not found' };
    }

    // Next page is (max + 1) within the doc — handles holes from any
    // hypothetical mid-doc deletion, not just append-only growth.
    const [maxRow] = await db()
      .select({ next: sql`COALESCE(MAX(${sessionImage.pageNumber}), 0) + 1` })
      .from(sessionImage)
      .where(eq(sessionImage.docId, docId));
    const pageNumber = Number(maxRow?.next) || 1;

    const page = await persistOnePage({
      sessionId,
      docId,
      pageNumber,
      image,
      log: request.log
    });
    if (!page) {
      reply.code(400);
      return { error: 'image bytes were invalid or duplicate of an existing page in this doc' };
    }

    await db()
      .update(sessionDoc)
      .set({ pageCount: doc.pageCount + 1, updatedAt: new Date() })
      .where(eq(sessionDoc.id, docId));

    // Appending a page to a doc reactivates it as the current doc, since
    // the user is clearly working on it again.
    await db()
      .update(tutorSession)
      .set({ currentDocId: docId, updatedAt: new Date() })
      .where(eq(tutorSession.id, sessionId));

    request.log.info(
      { sessionId, docId, pageNumber, imageId: page.id },
      'tutorAppendDocPage: page appended'
    );

    return { page };
  });
}
