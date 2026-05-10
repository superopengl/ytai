export default function healthcheck(fastify) {
  fastify.get('/healthcheck', async () => ({ ok: true }));
}
