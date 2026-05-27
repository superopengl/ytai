import { eq } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import { user } from '../db/schema.js';
import hashPassword from '../lib/hashPassword.js';
import verifyPasswordHash from '../lib/verifyPasswordHash.js';

const MIN_PASSWORD_LENGTH = 8;

// POST /api/admin/password
//   body: { currentPassword, newPassword }
//
// Change the signed-in admin's password. The global onRequest hook in
// server.js already gates this to role=admin via the JWT claim, so we
// don't re-check the role — we just verify the current password against
// the stored hash and write the new scrypt hash. Re-using the password
// the admin already has is allowed but a no-op write.
//
// Note: even if the bootstrap admin's password changes here, the next
// server restart will rehash and overwrite it from
// YTAI_ADMIN_PASSWORD (or the hardcoded default). Operators who want
// the change to stick must update the env var alongside.
export default function changeAdminPassword(fastify) {
  fastify.post('/api/admin/password', async (request, reply) => {
    const { currentPassword, newPassword } = request.body || {};

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return reply.code(400).send({ error: 'Current and new passwords are required' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return reply
        .code(400)
        .send({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const result = await withTx(async (tx) => {
      const [row] = await tx.select().from(user).where(eq(user.id, request.userId)).limit(1);
      if (!row || row.role !== 'admin' || !row.passwordHash) {
        return { kind: 'not-admin' };
      }
      const ok = await verifyPasswordHash(currentPassword, row.passwordHash);
      if (!ok) return { kind: 'bad-current' };

      const newHash = await hashPassword(newPassword);
      await tx
        .update(user)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(user.id, row.id));
      return { kind: 'ok' };
    });

    if (result.kind === 'not-admin') {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (result.kind === 'bad-current') {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }
    return { ok: true };
  });
}
