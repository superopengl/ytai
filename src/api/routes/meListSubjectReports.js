import { and, desc, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { subjectReport, user } from '../db/schema.js';

const DEV_USER_NAME = 'dev';

export default function meListSubjectReports(fastify) {
  fastify.get('/api/me/subject-reports', async () => {
    const [bootstrapUser] = await db()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.name, DEV_USER_NAME));

    if (!bootstrapUser) return { reports: [] };

    const rows = await db()
      .select({
        id: subjectReport.id,
        subject: subjectReport.subject,
        reportType: subjectReport.reportType,
        status: subjectReport.status,
        narrative: subjectReport.narrative,
        content: subjectReport.content,
        customPrompt: subjectReport.customPrompt,
        promptHash: subjectReport.promptHash,
        generatedAt: subjectReport.generatedAt,
        includedSessions: subjectReport.includedSessions,
        updatedAt: subjectReport.updatedAt
      })
      .from(subjectReport)
      .where(and(eq(subjectReport.userId, bootstrapUser.id), eq(subjectReport.status, 'ready')))
      .orderBy(desc(subjectReport.generatedAt));

    return { reports: rows };
  });
}
