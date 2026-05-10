import Fastify from 'fastify';
import healthcheck from './routes/healthcheck.js';

export default async function server() {
  const app = Fastify({ logger: true });

  app.get('/healthcheck', healthcheck);

  // Application routes are registered under /api as features come online.

  const port = Number(process.env.YTAI_API_PORT ?? 9521);
  await app.listen({ port, host: '0.0.0.0' });
  return app;
}

server().catch((err) => {
  console.error(err);
  process.exit(1);
});
