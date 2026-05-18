import Fastify from 'fastify';
import healthcheck from './routes/healthcheck.js';
import tutorCreateSession from './routes/tutorCreateSession.js';
import tutorGetImage from './routes/tutorGetImage.js';
import tutorGetMessages from './routes/tutorGetMessages.js';
import tutorListSessions from './routes/tutorListSessions.js';
import tutorSendMessage from './routes/tutorSendMessage.js';
import tutorSpeak from './routes/tutorSpeak.js';
import tutorUpdateSession from './routes/tutorUpdateSession.js';

export default async function server() {
  const app = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });

  healthcheck(app);
  tutorCreateSession(app);
  tutorGetImage(app);
  tutorGetMessages(app);
  tutorListSessions(app);
  tutorSendMessage(app);
  tutorSpeak(app);
  tutorUpdateSession(app);

  const port = Number(process.env.YTAI_API_PORT ?? 9521);
  await app.listen({ port, host: '0.0.0.0' });
  return app;
}

server().catch((err) => {
  console.error(err);
  process.exit(1);
});
