import { desc, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { subjectReport } from '../db/schema.js';

export default function meListSubjectReports(fastify) {
  fastify.get('/api/me/subject-reports', async (request) => {
    const userId = request.userId;

    // Return rows in every status — pending rows let the Reports page
    // render a "Generating…" card the moment the user kicks off a
    // report, and failed rows surface their error in the same list
    // instead of being silently lost.
    const rows = await db()
      .select({
        id: subjectReport.id,
        subject: subjectReport.subject,
        status: subjectReport.status,
        narrative: subjectReport.narrative,
        content: subjectReport.content,
        customPrompt: subjectReport.customPrompt,
        generatedAt: subjectReport.generatedAt,
        includedSessions: subjectReport.includedSessions,
        error: subjectReport.error,
        createdAt: subjectReport.createdAt,
        updatedAt: subjectReport.updatedAt
      })
      .from(subjectReport)
      .where(eq(subjectReport.userId, userId))
      .orderBy(desc(subjectReport.createdAt));

    return { reports: rows };
  });
}
