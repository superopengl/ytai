import { and, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { subjectReport, user } from '../db/schema.js';

const DEV_USER_NAME = 'dev';

export default function meDeleteSubjectReport(fastify) {
  fastify.delete('/api/me/subject-report/:id', async (request, reply) => {
    const { id } = request.params;

    const [bootstrapUser] = await db()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.name, DEV_USER_NAME));

    if (!bootstrapUser) {
      reply.code(404);
      return { error: 'Report not found' };
    }

    const result = await db()
      .delete(subjectReport)
      .where(and(eq(subjectReport.id, id), eq(subjectReport.userId, bootstrapUser.id)))
      .returning({ id: subjectReport.id });

    if (result.length === 0) {
      reply.code(404);
      return { error: 'Report not found' };
    }

    return { ok: true };
  });
}
