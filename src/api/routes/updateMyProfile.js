import db from '../db/index.js';
import { userProfile } from '../db/schema.js';
import isYear, { YEARS } from '../lib/year.js';

export default function updateMyProfile(fastify) {
  fastify.patch('/api/me/profile', async (request, reply) => {
    const userId = request.userId;
    const body = request.body ?? {};
    const hasYear = Object.prototype.hasOwnProperty.call(body, 'year');

    if (!hasYear) {
      reply.code(400);
      return { error: 'year is required' };
    }
    if (body.year !== null && !isYear(body.year)) {
      reply.code(400);
      return { error: `year must be one of: ${YEARS.join(', ')} (or null)` };
    }

    const now = new Date();
    const [row] = await db()
      .insert(userProfile)
      .values({ userId, year: body.year, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: { year: body.year, updatedAt: now }
      })
      .returning({ year: userProfile.year });

    return { year: row.year };
  });
}
