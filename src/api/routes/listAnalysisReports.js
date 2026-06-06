import { and, desc, eq, inArray } from 'drizzle-orm';
import db from '../db/index.js';
import { subjectReport } from '../db/schema.js';

// Loose UUID v4 check — enough to reject obvious garbage before the SQL.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;

export default function listAnalysisReports(fastify) {
  fastify.get('/api/analysis-reports', async (request, reply) => {
    const userId = request.userId;

    // Optional `?ids=a,b,c` filter so the Reports page can poll *just* the
    // pending rows it already knows about, instead of refetching the full
    // history every 2.5s. Bounded to MAX_IDS to keep the URL and IN-list
    // reasonable. Rows the requested user doesn't own simply don't come
    // back (the userId filter handles that).
    let idFilter = null;
    if (typeof request.query?.ids === 'string' && request.query.ids.length > 0) {
      const ids = request.query.ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > MAX_IDS) {
        return reply.code(400).send({ error: `Too many ids (max ${MAX_IDS})` });
      }
      if (ids.some((id) => !UUID_RE.test(id))) {
        return reply.code(400).send({ error: 'Invalid id format' });
      }
      // No ids → return an empty list immediately rather than running a
      // SELECT that would silently degrade to "every row" without the
      // inArray clause.
      if (ids.length === 0) return { reports: [] };
      idFilter = inArray(subjectReport.id, ids);
    }

    // Return rows in every status — pending rows let the Reports page
    // render a "Generating…" card the moment the user kicks off a
    // report, and failed rows surface their error in the same list
    // instead of being silently lost.
    const rows = await db()
      .select({
        id: subjectReport.id,
        subject: subjectReport.subject,
        year: subjectReport.year,
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
      .where(idFilter ? and(eq(subjectReport.userId, userId), idFilter) : eq(subjectReport.userId, userId))
      .orderBy(desc(subjectReport.createdAt));

    return { reports: rows };
  });
}
