import { eq, or } from 'drizzle-orm';
import db from '../db/index.js';
import { user } from '../db/schema.js';
import verifyGoogleIdToken from '../lib/verifyGoogleIdToken.js';

const ALLOWED_ROLES = new Set(['student', 'parent', 'teacher']);
const DEFAULT_ROLE = 'student';

// POST /api/auth/google
//   body: { credential: <google_id_token>, role?: 'student'|'parent'|'teacher' }
//
// Verifies the ID token with Google, then upserts the user (by google_id, falling
// back to email so we can link a legacy local account to its Google identity on
// first sign-in). Returns a YTAI JWT plus the user record. New users land in
// `status: 'pending'` — admin approval is still required for MVP.
export default function authGoogle(fastify) {
  fastify.post('/api/auth/google', async (request, reply) => {
    const { credential, role: requestedRole } = request.body || {};
    if (!credential) {
      return reply.code(400).send({ error: 'Missing Google credential' });
    }

    const clientId = process.env.YTAI_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return reply.code(503).send({ error: 'Google SSO is not configured on this server' });
    }

    let claims;
    try {
      claims = await verifyGoogleIdToken(credential, { clientId });
    } catch (err) {
      request.log.warn({ err }, 'Google ID token verification failed');
      return reply.code(401).send({ error: 'Invalid Google credential' });
    }

    const desiredRole = ALLOWED_ROLES.has(requestedRole) ? requestedRole : DEFAULT_ROLE;

    let [existing] = await db()
      .select()
      .from(user)
      .where(
        or(
          eq(user.googleId, claims.sub),
          claims.email ? eq(user.email, claims.email) : eq(user.googleId, claims.sub)
        )
      )
      .limit(1);

    let record;
    if (existing) {
      // Link Google identity onto an existing local account, refresh profile fields.
      const [updated] = await db()
        .update(user)
        .set({
          googleId: claims.sub,
          email: existing.email || claims.email,
          picture: claims.picture || existing.picture,
          authProvider: 'google',
          updatedAt: new Date()
        })
        .where(eq(user.id, existing.id))
        .returning();
      record = updated;
    } else {
      const [created] = await db()
        .insert(user)
        .values({
          name: claims.name,
          role: desiredRole,
          status: 'pending',
          authProvider: 'google',
          email: claims.email,
          googleId: claims.sub,
          picture: claims.picture
        })
        .returning();
      record = created;
    }

    const token = await reply.jwtSign(
      { sub: record.id, role: record.role, status: record.status },
      { expiresIn: '30d' }
    );

    return {
      token,
      user: {
        id: record.id,
        name: record.name,
        role: record.role,
        status: record.status,
        email: record.email,
        picture: record.picture
      }
    };
  });
}
