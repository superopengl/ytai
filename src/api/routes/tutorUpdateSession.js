import { and, eq } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import { sessionDoc, tutorSession } from '../db/schema.js';
import { GUIDANCE_LEVELS, isGuidanceLevel } from '../lib/tutorPrompt.js';
import isSubject, { SUBJECTS } from '../lib/tutorSubject.js';
import isYear, { YEARS } from '../lib/year.js';

export default function tutorUpdateSession(fastify) {
  fastify.patch('/api/tutor/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    const userId = request.userId;
    const body = request.body ?? {};
    const hasGuidance = Object.prototype.hasOwnProperty.call(body, 'guidanceLevel');
    const hasSubject = Object.prototype.hasOwnProperty.call(body, 'subject');
    const hasCurrentDoc = Object.prototype.hasOwnProperty.call(body, 'currentDocId');
    const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
    const hasYear = Object.prototype.hasOwnProperty.call(body, 'year');

    if (!hasGuidance && !hasSubject && !hasCurrentDoc && !hasTitle && !hasYear) {
      reply.code(400);
      return { error: 'guidanceLevel, subject, currentDocId, title, or year is required' };
    }
    if (hasGuidance && !isGuidanceLevel(body.guidanceLevel)) {
      reply.code(400);
      return { error: `guidanceLevel must be one of: ${GUIDANCE_LEVELS.join(', ')}` };
    }
    if (hasSubject && !isSubject(body.subject)) {
      reply.code(400);
      return { error: `subject must be one of: ${SUBJECTS.join(', ')}` };
    }
    if (hasYear && !isYear(body.year)) {
      reply.code(400);
      return { error: `year must be one of: ${YEARS.join(', ')}` };
    }
    if (hasCurrentDoc && body.currentDocId !== null) {
      if (typeof body.currentDocId !== 'string' || body.currentDocId.length === 0) {
        reply.code(400);
        return { error: 'currentDocId must be a uuid string or null' };
      }
    }
    // Title: null or empty string clears back to the auto-generated preview;
    // any string is trimmed and capped at 80 chars (matches the sider's
    // visual budget). Anything else is a 400.
    let nextTitle;
    if (hasTitle) {
      if (body.title === null) {
        nextTitle = null;
      } else if (typeof body.title === 'string') {
        const trimmed = body.title.trim();
        if (trimmed.length === 0) nextTitle = null;
        else if (trimmed.length > 80) {
          reply.code(400);
          return { error: 'title must be 80 characters or fewer' };
        } else nextTitle = trimmed;
      } else {
        reply.code(400);
        return { error: 'title must be a string or null' };
      }
    }

    const patch = { updatedAt: new Date() };
    if (hasGuidance) patch.guidanceLevel = body.guidanceLevel;
    if (hasSubject) patch.subject = body.subject;
    if (hasCurrentDoc) patch.currentDocId = body.currentDocId;
    if (hasTitle) patch.title = nextTitle;
    if (hasYear) patch.year = body.year;

    const result = await withTx(async (tx) => {
      if (hasCurrentDoc && body.currentDocId !== null) {
        // Make sure the doc belongs to this session so a client can't point at
        // another user's doc.
        const [doc] = await tx
          .select({ id: sessionDoc.id })
          .from(sessionDoc)
          .where(and(eq(sessionDoc.id, body.currentDocId), eq(sessionDoc.sessionId, sessionId)));
        if (!doc) return { kind: 'docNotFound' };
      }

      const [updated] = await tx
        .update(tutorSession)
        .set(patch)
        .where(and(eq(tutorSession.id, sessionId), eq(tutorSession.userId, userId)))
        .returning({
          id: tutorSession.id,
          guidanceLevel: tutorSession.guidanceLevel,
          subject: tutorSession.subject,
          currentDocId: tutorSession.currentDocId,
          title: tutorSession.title,
          year: tutorSession.year
        });

      if (!updated) return { kind: 'sessionNotFound' };
      return { kind: 'ok', updated };
    });

    if (result.kind === 'docNotFound') {
      reply.code(404);
      return { error: 'Doc not found in this session' };
    }
    if (result.kind === 'sessionNotFound') {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const { updated } = result;
    return {
      sessionId: updated.id,
      guidanceLevel: updated.guidanceLevel,
      subject: updated.subject,
      currentDocId: updated.currentDocId,
      title: updated.title,
      year: updated.year
    };
  });
}
