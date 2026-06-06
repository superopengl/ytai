import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { tutorSession, userProfile } from '../db/schema.js';
import { DEFAULT_GUIDANCE_LEVEL, isGuidanceLevel } from '../lib/tutorPrompt.js';
import isSubject, { DEFAULT_SUBJECT } from '../lib/tutorSubject.js';
import isYear from '../lib/year.js';

const DEFAULT_YEAR = 'Y3';

export default function tutorCreateSession(fastify) {
  fastify.post('/api/tutor/session', async (request) => {
    const userId = request.userId;

    const requestedLevel = request.body?.guidanceLevel;
    const guidanceLevel = isGuidanceLevel(requestedLevel) ? requestedLevel : DEFAULT_GUIDANCE_LEVEL;

    const requestedSubject = request.body?.subject;
    const subject = isSubject(requestedSubject) ? requestedSubject : DEFAULT_SUBJECT;

    let year;
    if (isYear(request.body?.year)) {
      year = request.body.year;
    } else {
      const [profile] = await db()
        .select({ year: userProfile.year })
        .from(userProfile)
        .where(eq(userProfile.userId, userId));
      year = isYear(profile?.year) ? profile.year : DEFAULT_YEAR;
    }

    const [session] = await db()
      .insert(tutorSession)
      .values({ userId, guidanceLevel, subject, year })
      .returning({
        id: tutorSession.id,
        guidanceLevel: tutorSession.guidanceLevel,
        subject: tutorSession.subject,
        year: tutorSession.year
      });

    return {
      sessionId: session.id,
      guidanceLevel: session.guidanceLevel,
      subject: session.subject,
      year: session.year
    };
  });
}
