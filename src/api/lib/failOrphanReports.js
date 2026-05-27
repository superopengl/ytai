import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionReport, subjectReport } from '../db/schema.js';

// On every server boot, sweep any report rows still in `pending` state and
// mark them `failed`. The status transition is driven by an in-process
// fire-and-forget task (see runSubjectReport / generateSessionReport);
// if the previous process died — `node --watch` restart in dev, a crash,
// a SIGTERM in prod — that task is gone and the row will never flip on its
// own. Without this sweep the UI shows a "Generating…" spinner that never
// resolves.
//
// We do this synchronously before listen() so the page reload that
// follows the dev restart already sees the cleaned-up row.
export default async function failOrphanReports(log) {
  const reason = 'server restarted before generation completed';
  try {
    const subjectRows = await db()
      .update(subjectReport)
      .set({ status: 'failed', error: reason, updatedAt: new Date() })
      .where(eq(subjectReport.status, 'pending'))
      .returning({ id: subjectReport.id });
    const sessionRows = await db()
      .update(sessionReport)
      .set({ status: 'failed', error: reason, updatedAt: new Date() })
      .where(eq(sessionReport.status, 'pending'))
      .returning({ sessionId: sessionReport.sessionId });
    if (subjectRows.length > 0 || sessionRows.length > 0) {
      log?.info(
        {
          subjectReports: subjectRows.length,
          sessionReports: sessionRows.length
        },
        'failOrphanReports: marked stuck rows as failed'
      );
    }
  } catch (err) {
    log?.warn({ err: err.message }, 'failOrphanReports: sweep failed');
  }
}
