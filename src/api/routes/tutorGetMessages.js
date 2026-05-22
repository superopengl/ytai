import { and, asc, eq, inArray } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionDoc, sessionImage, sessionMessage, tutorSession } from '../db/schema.js';

export default function tutorGetMessages(fastify) {
  fastify.get('/api/tutor/:sessionId/messages', async (request, reply) => {
    const { sessionId } = request.params;
    const userId = request.userId;

    const [session] = await db()
      .select({
        id: tutorSession.id,
        guidanceLevel: tutorSession.guidanceLevel,
        subject: tutorSession.subject,
        currentDocId: tutorSession.currentDocId
      })
      .from(tutorSession)
      .where(and(eq(tutorSession.id, sessionId), eq(tutorSession.userId, userId)));

    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const messages = await db()
      .select({
        id: sessionMessage.id,
        role: sessionMessage.role,
        content: sessionMessage.content,
        imageId: sessionMessage.imageId,
        interrupted: sessionMessage.interrupted,
        toolCalls: sessionMessage.toolCalls,
        createdAt: sessionMessage.createdAt
      })
      .from(sessionMessage)
      .where(eq(sessionMessage.sessionId, sessionId))
      .orderBy(asc(sessionMessage.createdAt));

    const docRows = await db()
      .select({
        id: sessionDoc.id,
        kind: sessionDoc.kind,
        pageCount: sessionDoc.pageCount,
        sortOrder: sessionDoc.sortOrder,
        createdAt: sessionDoc.createdAt
      })
      .from(sessionDoc)
      .where(eq(sessionDoc.sessionId, sessionId))
      .orderBy(asc(sessionDoc.createdAt));

    let pageRows = [];
    if (docRows.length > 0) {
      pageRows = await db()
        .select({
          id: sessionImage.id,
          docId: sessionImage.docId,
          pageNumber: sessionImage.pageNumber,
          width: sessionImage.width,
          height: sessionImage.height
        })
        .from(sessionImage)
        .where(inArray(sessionImage.docId, docRows.map((d) => d.id)))
        .orderBy(asc(sessionImage.pageNumber));
    }

    const pagesByDoc = new Map();
    for (const p of pageRows) {
      if (!pagesByDoc.has(p.docId)) pagesByDoc.set(p.docId, []);
      pagesByDoc.get(p.docId).push({
        id: p.id,
        pageNumber: p.pageNumber,
        width: p.width,
        height: p.height
      });
    }

    const docs = docRows.map((d) => ({
      ...d,
      pages: pagesByDoc.get(d.id) ?? []
    }));

    return {
      session: {
        id: session.id,
        guidanceLevel: session.guidanceLevel,
        subject: session.subject,
        currentDocId: session.currentDocId
      },
      messages,
      docs
    };
  });
}
