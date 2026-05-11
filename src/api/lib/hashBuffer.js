import { createHash } from 'node:crypto';

export default function hashBuffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
