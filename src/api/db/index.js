import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

let instance;

export default function db() {
  if (!instance) {
    const client = postgres(process.env.YTAI_DATABASE_URL);
    instance = drizzle(client, { schema });
  }
  return instance;
}

export function withTx(fn) {
  return db().transaction(fn);
}
