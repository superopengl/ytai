import { desc, eq, sql } from 'drizzle-orm';
import db from '../db/index.js';
import { user, loginOtp } from '../db/schema.js';

const MAX_ATTEMPTS = 5;
const CODE_RE = /^\d{6}$/;

// POST /api/auth/otp
//   body: { email, code }
//
// Verify the 6-digit code against the latest unconsumed OTP for the email.
// Wrong attempts increment a counter and the row is burned after
// MAX_ATTEMPTS — that bounds brute force on a 1-in-a-million code space.
// On success the row is deleted (no replay) and a YTAI JWT is returned in
// the same `{ token, user }` shape the Google SSO route uses.
export default function authOtp(fastify) {
  fastify.post('/api/auth/otp', async (request, reply) => {
    const { email: rawEmail, code: rawCode } = request.body || {};
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    if (!email || !CODE_RE.test(code)) {
      return reply.code(400).send({ error: 'Email and 6-digit code are required' });
    }

    const [row] = await db()
      .select()
      .from(loginOtp)
      .where(sql`lower(${loginOtp.email}) = ${email}`)
      .orderBy(desc(loginOtp.createdAt))
      .limit(1);

    if (!row) {
      return reply
        .code(404)
        .send({ error: 'No active sign-in code for this email. Please request a new one.' });
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      await db().delete(loginOtp).where(eq(loginOtp.id, row.id));
      return reply
        .code(410)
        .send({ error: 'This sign-in code has expired. Please request a new one.' });
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return reply
        .code(429)
        .send({ error: 'Too many wrong attempts. Please request a new code.' });
    }
    if (row.code !== code) {
      await db()
        .update(loginOtp)
        .set({ attempts: row.attempts + 1, updatedAt: new Date() })
        .where(eq(loginOtp.id, row.id));
      return reply.code(401).send({ error: "That code didn't match. Please try again." });
    }

    const [matchedUser] = await db()
      .select()
      .from(user)
      .where(eq(user.id, row.userId))
      .limit(1);
    if (!matchedUser) {
      return reply.code(500).send({ error: 'Account missing — please contact an administrator' });
    }

    await db().delete(loginOtp).where(eq(loginOtp.id, row.id));

    const token = await reply.jwtSign(
      { sub: matchedUser.id, role: matchedUser.role, status: matchedUser.status },
      { expiresIn: '30d' }
    );

    return {
      token,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        role: matchedUser.role,
        status: matchedUser.status,
        email: matchedUser.email,
        picture: matchedUser.picture
      }
    };
  });
}
