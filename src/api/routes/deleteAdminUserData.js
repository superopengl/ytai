import { eq, inArray } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import {
  sessionDoc,
  sessionImage,
  sessionMessage,
  sessionReport,
  subjectReport,
  tutorSession,
  user
} from '../db/schema.js';
import { markObjectOrphan } from '../lib/s3.js';

// DELETE /api/admin/user/:id/data
//
// Wipe every content row tied to a student account — sessions, docs,
// images, messages, session/subject reports. The `user` row itself stays
// (and login_otp + tts_audio are deliberately left alone — tts_audio is a
// cross-user cache, login_otp is short-lived auth state).
//
// `llm_usage` is explicitly NOT wiped: it's the per-call billing audit
// log and must be preserved for accounting / chargeback. Its FK columns
// are plain UUIDs (no DB-level FK constraint), so the rows happily
// outlive the entities they reference. Token-usage aggregates still
// resolve correctly because they filter on user_id (which is preserved)
// and group on (date, purpose, model).
//
// Restricted to `role='student'` accounts: admins and parents/teachers
// don't have tutoring content in the same shape, and refusing the call
// makes it impossible to accidentally nuke another admin's history.
//
// Single transaction (FK chains unwind in one shot).
export default function deleteAdminUserData(fastify) {
  fastify.delete('/api/admin/user/:id/data', async (request, reply) => {
    const { id: targetUserId } = request.params;
    if (!targetUserId) {
      reply.code(400);
      return { error: 'Missing user id' };
    }

    const result = await withTx(async (tx) => {
      const [target] = await tx
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.id, targetUserId))
        .limit(1);

      if (!target) return { kind: 'notFound' };
      if (target.role !== 'student') return { kind: 'notStudent', role: target.role };

      const sessions = await tx
        .select({ id: tutorSession.id })
        .from(tutorSession)
        .where(eq(tutorSession.userId, targetUserId));
      const sessionIds = sessions.map((s) => s.id);

      const subjectReports = await tx
        .select({ id: subjectReport.id })
        .from(subjectReport)
        .where(eq(subjectReport.userId, targetUserId));
      const subjectReportIds = subjectReports.map((r) => r.id);

      let imageIds = [];
      const orphanUrls = [];
      if (sessionIds.length > 0) {
        const images = await tx
          .select({ id: sessionImage.id, storageUrl: sessionImage.storageUrl })
          .from(sessionImage)
          .where(inArray(sessionImage.sessionId, sessionIds));
        imageIds = images.map((i) => i.id);
        orphanUrls.push(...images.map((i) => i.storageUrl));

        const docs = await tx
          .select({ sourcePdfUrl: sessionDoc.sourcePdfUrl })
          .from(sessionDoc)
          .where(inArray(sessionDoc.sessionId, sessionIds));
        orphanUrls.push(...docs.map((d) => d.sourcePdfUrl).filter(Boolean));
      }

      if (sessionIds.length > 0) {
        // session_report.cursor_message_id references session_message, so
        // drop the report first to free that FK before the messages go.
        await tx.delete(sessionReport).where(inArray(sessionReport.sessionId, sessionIds));
        await tx.delete(sessionMessage).where(inArray(sessionMessage.sessionId, sessionIds));
        // tutor_session.current_doc_id is an untyped UUID (no FK), so we
        // don't need to null it before deleting docs — but session_image
        // does FK-reference session_doc, so images go before docs.
        await tx.delete(sessionImage).where(inArray(sessionImage.sessionId, sessionIds));
        await tx.delete(sessionDoc).where(inArray(sessionDoc.sessionId, sessionIds));
        await tx.delete(tutorSession).where(eq(tutorSession.userId, targetUserId));
      }

      if (subjectReportIds.length > 0) {
        await tx.delete(subjectReport).where(eq(subjectReport.userId, targetUserId));
      }

      return {
        kind: 'ok',
        deleted: {
          sessions: sessionIds.length,
          images: imageIds.length,
          subjectReports: subjectReportIds.length
        },
        orphanUrls
      };
    });

    if (result.kind === 'notFound') {
      reply.code(404);
      return { error: 'User not found' };
    }
    if (result.kind === 'notStudent') {
      reply.code(409);
      return { error: `Refusing to wipe data for non-student account (role=${result.role})` };
    }

    // Tag the S3 bytes as orphan after commit. The bucket's tag-filtered
    // lifecycle rule reaps them on the next daily sweep (~24h).
    for (const url of result.orphanUrls) {
      markObjectOrphan(url).catch((err) => {
        request.log.error({ url, err }, 'deleteAdminUserData: orphan tag failed');
      });
    }

    request.log.info(
      { targetUserId, ...result.deleted },
      'admin: wiped user data'
    );
    return { ok: true, deleted: result.deleted };
  });
}
