import { eq, inArray, or } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import {
  imageOcr,
  llmUsage,
  sessionDoc,
  sessionImage,
  sessionMessage,
  sessionReport,
  subjectReport,
  tutorSession,
  user,
  visionExtraction
} from '../db/schema.js';

// DELETE /api/admin/user/:id/data
//
// Wipe every content row tied to a student account — sessions, docs,
// images, OCR, vision extractions, messages, session/subject reports,
// and the per-call llm_usage audit log. The `user` row itself stays
// (and login_otp + tts_audio are deliberately left alone — tts_audio
// is a cross-user cache, login_otp is short-lived auth state).
//
// Restricted to `role='student'` accounts: admins and parents/teachers
// don't have tutoring content in the same shape, and refusing the call
// makes it impossible to accidentally nuke another admin's history.
//
// Single transaction (FK chains unwind in one shot — partial wipes
// would leave dangling references to images that the OCR/vision rows
// still point at).
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
      if (sessionIds.length > 0) {
        const images = await tx
          .select({ id: sessionImage.id })
          .from(sessionImage)
          .where(inArray(sessionImage.sessionId, sessionIds));
        imageIds = images.map((i) => i.id);
      }

      // llm_usage rows fan in from every direction (user_id, session_id,
      // subject_report_id, message_id, image_id, session_report_id). Sweep
      // all of them in one statement before touching the FK targets, so
      // we don't have to worry about ordering against the message / image
      // / report deletes below.
      const llmUsageConditions = [eq(llmUsage.userId, targetUserId)];
      if (sessionIds.length > 0) llmUsageConditions.push(inArray(llmUsage.sessionId, sessionIds));
      if (subjectReportIds.length > 0) {
        llmUsageConditions.push(inArray(llmUsage.subjectReportId, subjectReportIds));
      }
      await tx.delete(llmUsage).where(or(...llmUsageConditions));

      if (sessionIds.length > 0) {
        if (imageIds.length > 0) {
          await tx.delete(visionExtraction).where(inArray(visionExtraction.imageId, imageIds));
          await tx.delete(imageOcr).where(inArray(imageOcr.imageId, imageIds));
        }
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
        }
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

    request.log.info(
      { targetUserId, ...result.deleted },
      'admin: wiped user data'
    );
    return { ok: true, deleted: result.deleted };
  });
}
