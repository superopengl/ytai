import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

let instance;

export default function db() {
  if (!instance) {
    // postgres-js defaults to max: 10 connections with no idle/connect
    // timeouts. Under SSE chat load (each turn opens multiple short
    // transactions) + concurrent TTS sentence requests, 10 is easy to
    // exhaust; the overflow queues inside Fastify, holding request bodies
    // and JWT context in memory. Bump the pool and add timeouts so idle
    // connections don't stick around forever and a wedged backend errors
    // fast instead of piling up callers.
    const client = postgres(process.env.YTAI_DATABASE_URL, {
      max: Number(process.env.YTAI_DB_POOL_MAX) || 20,
      idle_timeout: Number(process.env.YTAI_DB_IDLE_TIMEOUT) || 20,
      connect_timeout: Number(process.env.YTAI_DB_CONNECT_TIMEOUT) || 10
    });
    instance = drizzle(client, { schema });
  }
  return instance;
}

export function withTx(fn) {
  return db().transaction(fn);
}
