import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import { user, loginOtp } from '../db/schema.js';
import generateOtp from '../lib/generateOtp.js';
import sendOtpEmail from '../lib/sendOtpEmail.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Derive a stable display name from the email's local part. Used only
// when auto-creating a new user on first sign-in — they can update it
// later via a profile UI.
function deriveDisplayName(email) {
  const local = email.split('@')[0] || 'student';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// POST /api/auth/email
//   body: { email }
//
// Issue a 6-digit OTP for the given email and (best-effort) send it via
// SES. The OTP row is stored in plain text so admins can read it back when
// email delivery fails. Auto-creates a user on the first request for an
// unknown email.
//
// Resending within RESEND_COOLDOWN_MS short-circuits and reuses the live
// row — keeps a kid mashing the button from fanning out into a dozen valid
// codes simultaneously.
export default function authEmail(fastify) {
  fastify.post('/api/auth/email', async (request, reply) => {
    const { email: rawEmail } = request.body || {};
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email)) {
      return reply.code(400).send({ error: 'Please enter a valid email address' });
    }

    const { otpRow, matchedUser } = await withTx(async (tx) => {
      // Opportunistic GC of expired OTP rows so the table stays small without
      // a cron. Indexed on expires_at so it's cheap.
      await tx.delete(loginOtp).where(lte(loginOtp.expiresAt, new Date()));

      let [matched] = await tx
        .select()
        .from(user)
        .where(sql`lower(${user.email}) = ${email}`)
        .limit(1);

      if (!matched) {
        const [created] = await tx
          .insert(user)
          .values({
            name: deriveDisplayName(email),
            role: 'student',
            authProvider: 'email',
            email
          })
          .returning();
        matched = created;
      }

      const cutoff = new Date(Date.now() - RESEND_COOLDOWN_MS);
      const [recent] = await tx
        .select()
        .from(loginOtp)
        .where(
          and(
            eq(loginOtp.userId, matched.id),
            gt(loginOtp.createdAt, cutoff),
            sql`${loginOtp.expiresAt} > now()`
          )
        )
        .orderBy(desc(loginOtp.createdAt))
        .limit(1);

      let row = recent;
      if (!row) {
        const code = generateOtp();
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        [row] = await tx
          .insert(loginOtp)
          .values({ userId: matched.id, email, code, expiresAt })
          .returning();
      }

      return { otpRow: row, matchedUser: matched };
    });

    // Fire-and-forget: the OTP is already committed, so the client doesn't
    // need to wait on SES latency. sendOtpEmail catches its own errors and
    // logs them; the .catch here is a defensive backstop.
    sendOtpEmail({
      to: email,
      code: otpRow.code,
      expiresAt: otpRow.expiresAt,
      recipientName: matchedUser.name || null,
      log: request.log
    }).catch((err) => request.log.error({ err, to: email }, 'sendOtpEmail threw'));

    request.log.info({ requestId: randomBytes(4).toString('hex'), to: email }, 'OTP request handled');

    return { expiresAt: otpRow.expiresAt.toISOString() };
  });
}
