import { desc, eq } from 'drizzle-orm';
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

    // Return rows in every status — pending rows let the Reports page
    // render a "Generating…" card the moment the user kicks off a
    // report, and failed rows surface their error in the same list
    // instead of being silently lost.
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
        error: subjectReport.error,
        createdAt: subjectReport.createdAt,
        updatedAt: subjectReport.updatedAt
      })
      .from(subjectReport)
      .where(eq(subjectReport.userId, bootstrapUser.id))
      .orderBy(desc(subjectReport.createdAt));

    return { reports: rows };
  });
}
