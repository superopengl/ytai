import { eq, sql } from 'drizzle-orm';
import db from '../db/index.js';
import { user } from '../db/schema.js';
import hashPassword from './hashPassword.js';
import verifyPasswordHash from './verifyPasswordHash.js';

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'adminadmin';

// Idempotent boot-time admin upsert. Runs once on server start and
// guarantees there is at least one local password-login user with
// `role='admin'`.
//
// Resolution order:
//   1. `YTAI_ADMIN_USERNAME` + `YTAI_ADMIN_PASSWORD` if both set in the env.
//   2. Otherwise the hardcoded default (`admin` / `adminadmin`) so a fresh
//      checkout has a working admin sign-in without any extra setup.
//
// We compare the new password against the stored hash to skip the rehash
// if it already matches — that keeps the write off the hot path on every
// restart.
export default async function bootstrapAdmin(log) {
  const userName = (process.env.YTAI_ADMIN_USERNAME || DEFAULT_USERNAME).trim().toLowerCase();
  const password = process.env.YTAI_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  if (!userName || !password) return;

  const [existing] = await db()
    .select()
    .from(user)
    .where(sql`lower(${user.userName}) = ${userName}`)
    .limit(1);

  if (!existing) {
    const passwordHash = await hashPassword(password);
    await db()
      .insert(user)
      .values({
        name: userName,
        userName,
        role: 'admin',
        status: 'approved',
        authProvider: 'local',
        passwordHash
      });
    log?.info({ userName }, 'bootstrapAdmin: created default admin user');
    return;
  }

  const passwordOk = existing.passwordHash && (await verifyPasswordHash(password, existing.passwordHash));
  if (existing.role === 'admin' && existing.status === 'approved' && passwordOk) return;

  const passwordHash = passwordOk ? existing.passwordHash : await hashPassword(password);
  await db()
    .update(user)
    .set({
      role: 'admin',
      status: 'approved',
      passwordHash,
      userName: existing.userName || userName,
      updatedAt: new Date()
    })
    .where(eq(user.id, existing.id));
  log?.info({ userName }, 'bootstrapAdmin: refreshed default admin user');
}
