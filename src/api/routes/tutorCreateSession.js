import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { tutorSession, user } from '../db/schema.js';

const DEV_USER_NAME = 'dev';

export default function tutorCreateSession(fastify) {
  fastify.post('/api/tutor/session', async () => {
    let [bootstrapUser] = await db()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.name, DEV_USER_NAME));

    if (!bootstrapUser) {
      [bootstrapUser] = await db()
        .insert(user)
        .values({ name: DEV_USER_NAME, role: 'student', status: 'approved' })
        .returning({ id: user.id });
    }

    const [session] = await db()
      .insert(tutorSession)
      .values({ userId: bootstrapUser.id })
      .returning({ id: tutorSession.id });

    return { sessionId: session.id };
  });
}
