import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import authGoogle from './routes/authGoogle.js';
import healthcheck from './routes/healthcheck.js';
import meGetWeaknesses from './routes/meGetWeaknesses.js';
import tutorAppendDocPage from './routes/tutorAppendDocPage.js';
import tutorCreateDoc from './routes/tutorCreateDoc.js';
import tutorCreateSession from './routes/tutorCreateSession.js';
import tutorDeleteSession from './routes/tutorDeleteSession.js';
import tutorGetImage from './routes/tutorGetImage.js';
import tutorGetMessages from './routes/tutorGetMessages.js';
import tutorGetReport from './routes/tutorGetReport.js';
import tutorListSessions from './routes/tutorListSessions.js';
import tutorSendMessage from './routes/tutorSendMessage.js';
import tutorSpeak from './routes/tutorSpeak.js';
import tutorUpdateSession from './routes/tutorUpdateSession.js';

export default async function server() {
  const isProd = process.env.NODE_ENV === 'production';
  const app = Fastify({
    logger: isProd
      ? true
      : {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' }
          }
        },
    bodyLimit: 20 * 1024 * 1024
  });

  const jwtSecret = process.env.YTAI_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('YTAI_JWT_SECRET is required');
  }
  await app.register(fastifyJwt, { secret: jwtSecret });

  healthcheck(app);
  authGoogle(app);
  meGetWeaknesses(app);
  tutorAppendDocPage(app);
  tutorCreateDoc(app);
  tutorCreateSession(app);
  tutorDeleteSession(app);
  tutorGetImage(app);
  tutorGetMessages(app);
  tutorGetReport(app);
  tutorListSessions(app);
  tutorSendMessage(app);
  tutorSpeak(app);
  tutorUpdateSession(app);

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
