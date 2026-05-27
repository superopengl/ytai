import { sql } from 'drizzle-orm';
import db from '../db/index.js';
import { user } from '../db/schema.js';
import verifyPasswordHash from '../lib/verifyPasswordHash.js';

// POST /api/auth/password
//   body: { userName, password }
//
// Admin-only username + password sign-in. Every other auth path is
// passwordless (Google SSO / email OTP); this one exists so an operator
// can sign in even when Google or email delivery is down.
//
// Only users with `role='admin'` and a non-null `password_hash` can
// authenticate here. Every failure mode — missing user, wrong password,
// non-admin role — returns the same generic 401 so we don't leak which
// case fired.
export default function authPassword(fastify) {
  fastify.post('/api/auth/password', async (request, reply) => {
    const { userName, password } = request.body || {};
    if (typeof userName !== 'string' || typeof password !== 'string' || !userName.trim() || !password) {
      return reply.code(400).send({ error: 'Username and password are required' });
    }

    const [matched] = await db()
      .select()
      .from(user)
      .where(sql`lower(${user.localLoginUserName}) = lower(${userName.trim()})`)
      .limit(1);

    const ok =
      matched &&
      matched.role === 'admin' &&
      matched.passwordHash &&
      (await verifyPasswordHash(password, matched.passwordHash));

    if (!ok) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }

    const token = await reply.jwtSign(
      { sub: matched.id, role: matched.role },
      { expiresIn: '30d' }
    );

    return {
      token,
      user: {
        id: matched.id,
        name: matched.name,
        role: matched.role,
        email: matched.email,
        picture: matched.picture
      }
    };
  });
}
