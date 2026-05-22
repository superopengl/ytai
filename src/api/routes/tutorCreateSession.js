import db from '../db/index.js';
import { tutorSession } from '../db/schema.js';
import { DEFAULT_GUIDANCE_LEVEL, isGuidanceLevel } from '../lib/tutorPrompt.js';
import isSubject, { DEFAULT_SUBJECT } from '../lib/tutorSubject.js';

export default function tutorCreateSession(fastify) {
  fastify.post('/api/tutor/session', async (request) => {
    const userId = request.userId;

    const requestedLevel = request.body?.guidanceLevel;
    const guidanceLevel = isGuidanceLevel(requestedLevel) ? requestedLevel : DEFAULT_GUIDANCE_LEVEL;

    const requestedSubject = request.body?.subject;
    const subject = isSubject(requestedSubject) ? requestedSubject : DEFAULT_SUBJECT;

    const [session] = await db()
      .insert(tutorSession)
      .values({ userId, guidanceLevel, subject })
      .returning({
        id: tutorSession.id,
        guidanceLevel: tutorSession.guidanceLevel,
        subject: tutorSession.subject
      });

    return {
      sessionId: session.id,
      guidanceLevel: session.guidanceLevel,
      subject: session.subject
    };
  });
}
