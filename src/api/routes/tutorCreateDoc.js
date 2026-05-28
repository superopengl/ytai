import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import { sessionDoc, sessionImage, tutorSession } from '../db/schema.js';
import ensureImageOcr from '../lib/ensureImageOcr.js';
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

    // Decode + S3-persist all images up front so the DB transaction below
    // doesn't hold a Postgres connection during multi-megabyte uploads.
    const decoded = images.map((img) => decodeAndDescribe(img));
    const usable = decoded.filter((d) => d !== null);
    if (usable.length === 0) {
      reply.code(400);
      return { error: 'no valid images supplied' };
    }
    // Pre-generate the row UUID so the S3 key (one-to-one with the row)
    // can be written before the DB insert. Keeps the transaction short
    // and makes orphan-tagging on session delete trivial: each S3 object
    // belongs to exactly one session_image row.
    const persisted = [];
    for (const d of usable) {
      const imageId = randomUUID();
      const { storageUrl } = await persistImage({
        bytes: d.bytes,
        imageId,
        mimeType: d.mimeType
      });
      persisted.push({ ...d, imageId, storageUrl });
    }

    let txResult;
    try {
      txResult = await withTx(async (tx) => {
        const [session] = await tx
          .select({ id: tutorSession.id })
          .from(tutorSession)
          .where(and(eq(tutorSession.id, sessionId), eq(tutorSession.userId, userId)));
        if (!session) return { kind: 'notFound' };

        // Where this doc lands in the session's doc timeline. We bump
        // sort_order to (max + 1) so the new doc appears after every existing
        // one. The integer is cosmetic — created_at is the real timeline — but
        // having it makes the order stable across same-ms inserts.
        const [maxRow] = await tx
          .select({ next: sql`COALESCE(MAX(${sessionDoc.sortOrder}), -1) + 1` })
          .from(sessionDoc)
          .where(eq(sessionDoc.sessionId, sessionId));
        const nextSort = Number(maxRow?.next) || 0;

        const [docRow] = await tx
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

        const inserted = [];
        let pageNumber = 1;
        for (const p of persisted) {
          const [row] = await tx
            .insert(sessionImage)
            .values({
              id: p.imageId,
              sessionId,
              docId: docRow.id,
              pageNumber,
              storageUrl: p.storageUrl,
              width: p.width,
              height: p.height
            })
            .returning({
              id: sessionImage.id,
              pageNumber: sessionImage.pageNumber,
              width: sessionImage.width,
              height: sessionImage.height
            });
          inserted.push({ ...row, storageUrl: p.storageUrl });
          pageNumber += 1;
        }

        if (inserted.length === 0) {
          // Throw to roll back the empty doc row. Caller sees 400.
          const err = new Error('no rows inserted');
          err.code = 'NO_ROWS';
          throw err;
        }

        await tx
          .update(sessionDoc)
          .set({ pageCount: inserted.length, updatedAt: new Date() })
          .where(eq(sessionDoc.id, docRow.id));

        await tx
          .update(tutorSession)
          .set({ currentDocId: docRow.id, updatedAt: new Date() })
          .where(eq(tutorSession.id, sessionId));

        return { kind: 'ok', docRow, inserted };
      });
    } catch (err) {
      if (err?.code === 'NO_ROWS') {
        reply.code(400);
        return { error: 'no valid images supplied' };
      }
      throw err;
    }

    if (txResult.kind === 'notFound') {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const { docRow, inserted } = txResult;

    // Fire OCR jobs after commit so the inserted session_image rows are
    // visible to the background workers.
    for (const row of inserted) {
      ensureImageOcr({ imageId: row.id, storageUrl: row.storageUrl, log: request.log }).catch(
        () => {}
      );
    }

    request.log.info(
      { sessionId, docId: docRow.id, pageCount: inserted.length },
      'tutorCreateDoc: doc created'
    );

    return {
      doc: {
        id: docRow.id,
        kind: docRow.kind,
        sortOrder: docRow.sortOrder,
        createdAt: docRow.createdAt,
        pageCount: inserted.length,
        pages: inserted.map(({ id, pageNumber, width, height }) => ({
          id,
          pageNumber,
          width,
          height
        }))
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

function decodeAndDescribe(image) {
  const decoded = decodeDataUrl(image?.dataUrl);
  if (!decoded) return null;
  return {
    bytes: decoded.bytes,
    mimeType: decoded.mimeType,
    width: Math.max(0, Math.round(Number(image?.width) || 0)),
    height: Math.max(0, Math.round(Number(image?.height) || 0))
  };
}
