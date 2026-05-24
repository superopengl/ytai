import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

// Constant-time verify of a plaintext password against a `scrypt$salt$key`
// hash produced by hashPassword. Returns false (never throws) on any
// malformed input so callers don't need to special-case missing rows.
export default async function verifyPasswordHash(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, key] = parts;
  const expected = Buffer.from(key, 'hex');
  if (expected.length !== KEY_LENGTH) return false;
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return timingSafeEqual(expected, derived);
}
