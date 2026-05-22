import { and, eq, sql } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionDoc, sessionImage, tutorSession } from '../db/schema.js';
import ensureImageOcr from '../lib/ensureImageOcr.js';
import hashBuffer from '../lib/hashBuffer.js';
import persistImage from '../lib/persistImage.js';

// Create a new doc on a session from 1..N images. Each image becomes a
// page (page_number 1..N) inside the new doc. After insert, the session's
// current_doc_id is updated to point at the new doc so subsequent chat
// turns are scoped to it.
//
// Body: { images: [{ dataUrl, width, height }, ...], kind?: 'images' }
//   `kind` defaults to 'images'. PDF support arrives in a later slice
//   (server-side rasterization writes the same shape).
//
// Returns: { doc: { id, kind, sortOrder, createdAt,
//   pages: [{ id, pageNumber, width, height }] } }
export default function tutorCreateDoc(fastify) {
  fastify.post('/api/tutor/:sessionId/doc', async (request, reply) => {
    const { sessionId } = request.params;
    const userId = request.userId;
    const images = Array.isArray(request.body?.images) ? request.body.images : [];
    const kind = typeof request.body?.kind === 'string' ? request.body.kind : 'images';

    if (images.length === 0) {
      reply.code(400);
      return { error: 'images array is required (at least one image)' };
    }

    const [session] = await db()
      .select({ id: tutorSession.id })
      .from(tutorSession)
      .where(and(eq(tutorSession.id, sessionId), eq(tutorSession.userId, userId)));
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    // Where this doc lands in the session's doc timeline. We bump
    // sort_order to (max + 1) so the new doc appears after every existing
    // one. The integer is cosmetic — created_at is the real timeline — but
    // having it makes the order stable across same-ms inserts.
    const [maxRow] = await db()
      .select({ next: sql`COALESCE(MAX(${sessionDoc.sortOrder}), -1) + 1` })
      .from(sessionDoc)
      .where(eq(sessionDoc.sessionId, sessionId));
    const nextSort = Number(maxRow?.next) || 0;

    const [docRow] = await db()
      .insert(sessionDoc)
      .values({
        sessionId,
        kind,
        pageCount: 0,
        sortOrder: nextSort
      })
      .returning({
        id: sessionDoc.id,
        kind: sessionDoc.kind,
        sortOrder: sessionDoc.sortOrder,
        createdAt: sessionDoc.createdAt
      });

    const pages = [];
    let pageNumber = 1;
    for (const img of images) {
      const inserted = await persistOnePage({
        sessionId,
        docId: docRow.id,
        pageNumber,
        image: img,
        log: request.log
      });
      if (inserted) {
        pages.push(inserted);
        pageNumber += 1;
      }
    }

    if (pages.length === 0) {
      // Every image was malformed — roll back the empty doc so we don't
      // leave a zombie row.
      await db().delete(sessionDoc).where(eq(sessionDoc.id, docRow.id));
      reply.code(400);
      return { error: 'no valid images supplied' };
    }

    await db()
      .update(sessionDoc)
      .set({ pageCount: pages.length, updatedAt: new Date() })
      .where(eq(sessionDoc.id, docRow.id));

    await db()
      .update(tutorSession)
      .set({ currentDocId: docRow.id, updatedAt: new Date() })
      .where(eq(tutorSession.id, sessionId));

    request.log.info(
      { sessionId, docId: docRow.id, pageCount: pages.length },
      'tutorCreateDoc: doc created'
    );

    return {
      doc: {
        id: docRow.id,
        kind: docRow.kind,
        sortOrder: docRow.sortOrder,
        createdAt: docRow.createdAt,
        pageCount: pages.length,
        pages
      }
    };
  });
}

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], bytes: Buffer.from(match[2], 'base64') };
}

// Persist one image as a page of a given doc. Returns the public-facing
// page shape (id, pageNumber, width, height) or null when the input was
// unusable.
export async function persistOnePage({ sessionId, docId, pageNumber, image, log }) {
  const decoded = decodeDataUrl(image?.dataUrl);
  if (!decoded) {
    log?.warn({ sessionId, docId, pageNumber }, 'persistOnePage: malformed image, skipping');
    return null;
  }
  const contentHash = hashBuffer(decoded.bytes);
  const width = Math.max(0, Math.round(Number(image?.width) || 0));
  const height = Math.max(0, Math.round(Number(image?.height) || 0));

  // Dedup within the doc: re-uploading the same bytes onto the same page
  // collides on (doc_id, content_hash). When it does, reuse the row.
  const { storageUrl } = await persistImage({
    bytes: decoded.bytes,
    contentHash,
    mimeType: decoded.mimeType
  });

  const [row] = await db()
    .insert(sessionImage)
    .values({
      sessionId,
      docId,
      pageNumber,
      contentHash,
      storageUrl,
      width,
      height
    })
    .onConflictDoNothing()
    .returning({
      id: sessionImage.id,
      pageNumber: sessionImage.pageNumber,
      width: sessionImage.width,
      height: sessionImage.height
    });

  if (!row) {
    log?.info(
      { sessionId, docId, pageNumber, contentHash: contentHash.slice(0, 12) },
      'persistOnePage: duplicate hash within doc, skipping'
    );
    return null;
  }

  ensureImageOcr({ imageId: row.id, storageUrl, log }).catch(() => {});

  return row;
}
