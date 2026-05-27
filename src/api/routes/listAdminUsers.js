import { desc, isNull, ne, or } from 'drizzle-orm';
import db from '../db/index.js';
import { user } from '../db/schema.js';

// GET /api/admin/users
//
// Admin dashboard user list. Returns every real user — Google sign-ups,
// email OTP sign-ups, plus any other admins — newest first. The
// bootstrap admin (auth_provider='local' + local_login_user_name set) is filtered
// out: it's a machine-managed login handle, not a person, and surfacing
// it would just add noise to the admin's own management view.
//
// Auth: the global onRequest hook in server.js gates /api/admin/* to
// role=admin, so this handler doesn't need to re-check.
export default function listAdminUsers(fastify) {
  fastify.get('/api/admin/users', async () => {
    const rows = await db()
      .select({
        id: user.id,
        name: user.name,
        role: user.role,
        authProvider: user.authProvider,
        email: user.email,
        picture: user.picture,
        userName: user.userName,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      })
      .from(user)
      .where(
        or(ne(user.authProvider, 'local'), isNull(user.localLoginUserName))
      )
      .orderBy(desc(user.createdAt));

    return { users: rows };
  });
}
