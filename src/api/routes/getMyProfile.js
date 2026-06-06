import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { userProfile } from '../db/schema.js';

export default function getMyProfile(fastify) {
  fastify.get('/api/me/profile', async (request) => {
    const userId = request.userId;
    const [row] = await db()
      .select({ year: userProfile.year })
      .from(userProfile)
      .where(eq(userProfile.userId, userId));
    return { year: row?.year ?? null };
  });
}
