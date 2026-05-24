import { eq, or } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import { user } from '../db/schema.js';
import verifyGoogleIdToken from '../lib/verifyGoogleIdToken.js';
import verifyGoogleAccessToken from '../lib/verifyGoogleAccessToken.js';

const ALLOWED_ROLES = new Set(['student', 'parent', 'teacher']);
const DEFAULT_ROLE = 'student';

// POST /api/auth/google
//   body: { credential?, accessToken?, role?: 'student'|'parent'|'teacher' }
//
// Two accepted token shapes:
//   - `credential` — a Google Identity Services ID token (legacy, from the
//     GIS-rendered button credential callback).
//   - `accessToken` — an OAuth 2.0 access token from oauth2.initTokenClient,
//     which is what the current frontend uses so it can ship its own AntD-
//     styled button instead of GIS's personalized "Sign in as X" variant.
//
// Both paths resolve to the same claims shape (sub/email/name/picture) and
// drive the same upsert. New users land in `status: 'pending'` — admin
// approval is still required.
export default function authGoogle(fastify) {
  fastify.post('/api/auth/google', async (request, reply) => {
    const { credential, accessToken, role: requestedRole } = request.body || {};
    if (!credential && !accessToken) {
      return reply.code(400).send({ error: 'Missing Google credential or access token' });
    }

    const clientId = process.env.YTAI_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return reply.code(503).send({ error: 'Google SSO is not configured on this server' });
    }

    let claims;
    try {
      claims = accessToken
        ? await verifyGoogleAccessToken(accessToken, { clientId })
        : await verifyGoogleIdToken(credential, { clientId });
    } catch (err) {
      request.log.warn({ err }, 'Google token verification failed');
      return reply.code(401).send({ error: 'Invalid Google credential' });
    }

    const desiredRole = ALLOWED_ROLES.has(requestedRole) ? requestedRole : DEFAULT_ROLE;

    const record = await withTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(user)
        .where(
          or(
            eq(user.googleId, claims.sub),
            claims.email ? eq(user.email, claims.email) : eq(user.googleId, claims.sub)
          )
        )
        .limit(1);

      if (existing) {
        // Link Google identity onto an existing local account, refresh profile fields.
        const [updated] = await tx
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
        return updated;
      }
      const [created] = await tx
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
      return created;
    });

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
