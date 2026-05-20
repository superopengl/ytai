import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionMessage, tutorSession, user } from '../db/schema.js';

const DEV_USER_NAME = 'dev';

export default function tutorListSessions(fastify) {
  fastify.get('/api/tutor/sessions', async () => {
    const [bootstrapUser] = await db()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.name, DEV_USER_NAME));

    if (!bootstrapUser) return { sessions: [] };

    // mapWith routes the aggregate result through the same Date converter
    // the column uses, so the client gets an ISO timestamp instead of the
    // raw "2026-05-18 19:48:35.965985+10" Postgres format.
    const lastActivityExpr = sql`COALESCE(MAX(${sessionMessage.createdAt}), ${tutorSession.startedAt})`.mapWith(
      sessionMessage.createdAt
    );

    const sessions = await db()
      .select({
        id: tutorSession.id,
        subject: tutorSession.subject,
        startedAt: tutorSession.startedAt,
        lastActivityAt: lastActivityExpr.as('last_activity_at'),
        messageCount: sql`COUNT(${sessionMessage.id})::int`.as('message_count')
      })
      .from(tutorSession)
      .leftJoin(sessionMessage, eq(sessionMessage.sessionId, tutorSession.id))
      .where(eq(tutorSession.userId, bootstrapUser.id))
      .groupBy(tutorSession.id)
      .orderBy(desc(lastActivityExpr));

    if (sessions.length === 0) return { sessions: [] };

    // Pull the first user-authored message per session in a single query
    // (DISTINCT ON keeps it to one row per session). This drives the
    // preview text shown on the row — UUIDs alone are a lousy label.
    const sessionIds = sessions.map((s) => s.id);
    const previews = await db()
      .selectDistinctOn([sessionMessage.sessionId], {
        sessionId: sessionMessage.sessionId,
        content: sessionMessage.content
      })
      .from(sessionMessage)
      .where(
        and(
          inArray(sessionMessage.sessionId, sessionIds),
          eq(sessionMessage.role, 'user'),
          // Image-only turns persist with empty content; skip them so the
          // preview shows the first thing the student actually typed.
          sql`length(trim(${sessionMessage.content})) > 0`
        )
      )
      .orderBy(sessionMessage.sessionId, asc(sessionMessage.createdAt));

    const previewBySession = new Map(previews.map((p) => [p.sessionId, p.content]));

    return {
      sessions: sessions.map((s) => ({
        ...s,
        preview: previewBySession.get(s.id) ?? null
      }))
    };
  });
}
