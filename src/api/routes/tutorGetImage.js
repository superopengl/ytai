import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionImage } from '../db/schema.js';

// Serves the flattened canvas bytes (photo + student strokes) for a given
// session_image row. Used by the chat UI to show the same image the student
// sent next to their message, so the transcript is visually complete.
export default function tutorGetImage(fastify) {
  fastify.get('/api/tutor/:sessionId/image/:imageId', async (request, reply) => {
    const { sessionId, imageId } = request.params;

    const [row] = await db()
      .select({ storageUrl: sessionImage.storageUrl })
      .from(sessionImage)
      .where(and(eq(sessionImage.id, imageId), eq(sessionImage.sessionId, sessionId)));

    if (!row) {
      reply.code(404);
      return { error: 'Image not found' };
    }

    if (!row.storageUrl.startsWith('file://')) {
      reply.code(501);
      return { error: 'Only file:// storage is supported in this build' };
    }

    const filePath = fileURLToPath(row.storageUrl);
    reply
      .header('Content-Type', mimeFromPath(filePath))
      .header('Cache-Control', 'private, max-age=86400');
    return reply.send(createReadStream(filePath));
  });
}

function mimeFromPath(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}
