import { and, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { subjectReport } from '../db/schema.js';

export default function deleteAnalysisReport(fastify) {
  fastify.delete('/api/analysis-report/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.userId;

    const result = await db()
      .delete(subjectReport)
      .where(and(eq(subjectReport.id, id), eq(subjectReport.userId, userId)))
      .returning({ id: subjectReport.id });

    if (result.length === 0) {
      reply.code(404);
      return { error: 'Report not found' };
    }

    return { ok: true };
  });
}
