import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// Hash a plaintext password with scrypt + a per-row 16-byte salt. Stored
// format is `scrypt$<saltHex>$<keyHex>` so verification stays self-contained
// (no separate salt column needed).
export default async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
