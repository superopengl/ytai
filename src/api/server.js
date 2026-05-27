import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import pinoPretty from 'pino-pretty';
import authEmail from './routes/authEmail.js';
import authGoogle from './routes/authGoogle.js';
import authOtp from './routes/authOtp.js';
import authPassword from './routes/authPassword.js';
import bootstrapAdmin from './lib/bootstrapAdmin.js';
import createAnalysisReport from './routes/createAnalysisReport.js';
import deleteAnalysisReport from './routes/deleteAnalysisReport.js';
import healthcheck from './routes/healthcheck.js';
import listAnalysisReports from './routes/listAnalysisReports.js';
import tutorCreateDoc from './routes/tutorCreateDoc.js';
import tutorCreateSession from './routes/tutorCreateSession.js';
import tutorDeleteSession from './routes/tutorDeleteSession.js';
import tutorGetImage from './routes/tutorGetImage.js';
import tutorGetMessages from './routes/tutorGetMessages.js';
import tutorListSessions from './routes/tutorListSessions.js';
import tutorSendMessage from './routes/tutorSendMessage.js';
import tutorSpeak from './routes/tutorSpeak.js';
import tutorUpdateSession from './routes/tutorUpdateSession.js';

export default async function server() {
  const isProd = process.env.NODE_ENV === 'production';
  // In dev, pipe through pino-pretty as a direct stream instead of using
  // the transport: worker option. The worker-thread transport (thread-stream)
  // races with `node --watch` on restart and crashes with
  // "this should not happen: undefined".
  const app = Fastify({
    logger: isProd
      ? true
      : { stream: pinoPretty({ colorize: true, translateTime: 'SYS:HH:MM:ss.l' }) },
    bodyLimit: 20 * 1024 * 1024
  });

  const jwtSecret = process.env.YTAI_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('YTAI_JWT_SECRET is required');
  }
  await app.register(fastifyJwt, { secret: jwtSecret });

  // Every /api/* request except /api/auth/* and /healthcheck must carry a
  // valid YTAI JWT. We verify once here and stash the user id on the
  // request so individual route handlers can scope every query to the
  // authenticated user — no per-route auth boilerplate, no chance of
  // forgetting to filter.
  app.addHook('onRequest', async (request, reply) => {
    const url = request.raw.url || '';
    if (!url.startsWith('/api/')) return;
    if (url.startsWith('/api/auth/')) return;
    try {
      await request.jwtVerify();
      request.userId = request.user?.sub;
      if (!request.userId) throw new Error('JWT missing sub claim');
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  healthcheck(app);
  authEmail(app);
  authGoogle(app);
  authOtp(app);
  authPassword(app);
  createAnalysisReport(app);
  deleteAnalysisReport(app);
  listAnalysisReports(app);
  tutorCreateDoc(app);
  tutorCreateSession(app);
  tutorDeleteSession(app);
  tutorGetImage(app);
  tutorGetMessages(app);
  tutorListSessions(app);
  tutorSendMessage(app);
  tutorSpeak(app);
  tutorUpdateSession(app);

  // SPA serving — only in prod, and only when the built portal exists.
  // In dev, Vite serves the portal separately on YTAI_PORTAL_PORT, so the
  // API doesn't need to ship static files. In prod, dist/public lands at
  // /opt/ytai/public (kpai-style image layout: dist contents copied flat).
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.resolve(__dirname, '../../public');
  if (isProd && existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir, prefix: '/' });
    // SPA fallback: any non-/api/* miss falls through to index.html so
    // react-router-dom can take over client-side. /api/* keeps the
    // standard JSON 404 so misrouted API calls don't silently land on
    // the HTML shell.
    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url || '';
      if (url.startsWith('/api/')) {
        reply.code(404).send({
          message: `Route ${request.method}:${url} not found`,
          error: 'Not Found',
          statusCode: 404,
        });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  try {
    await bootstrapAdmin(app.log);
  } catch (err) {
    app.log.error({ err }, 'bootstrapAdmin failed');
  }

  const port = Number(process.env.YTAI_API_PORT ?? 9521);
  await app.listen({ port, host: '0.0.0.0' });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      try {
        await app.close();
      } finally {
        process.exit(0);
      }
    });
  }

  return app;
}

server().catch((err) => {
  console.error(err);
  process.exit(1);
});
