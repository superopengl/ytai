import { and, eq, inArray } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionReport, tutorSession, user } from '../db/schema.js';

const DEV_USER_NAME = 'dev';

// Maps the frontend subject key to the `nswSubject` value the session
// reporter writes onto each question. 'thinking' has no clean NSW
// catalog mapping yet — return null and the aggregation will be empty.
function nswSubjectFor(subject) {
  if (subject === 'math') return 'Mathematics';
  if (subject === 'reading' || subject === 'writing') return 'English';
  return null;
}

// A question counts as "struggled" if the student got it wrong, OR if
// they attempted it (wrote something) and the tutor couldn't determine
// correctness. Skips not-attempted rows so a quiet session doesn't pad
// the weakness list with empty entries.
function isStruggled(q) {
  if (q.correct === false) return true;
  if (q.correct === null && q.studentAnswer && q.studentAnswer.trim() !== '') return true;
  return false;
}

export default function meGetWeaknesses(fastify) {
  fastify.get('/api/me/weaknesses', async (request) => {
    const subjectKey = String(request.query?.subject ?? 'math');
    const nswSubject = nswSubjectFor(subjectKey);

    const [bootstrapUser] = await db()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.name, DEV_USER_NAME));

    if (!bootstrapUser || !nswSubject) {
      return {
        subject: subjectKey,
        totals: { attempted: 0, wrong: 0, missRate: 0 },
        focusAreas: []
      };
    }

    const sessions = await db()
      .select({ id: tutorSession.id, startedAt: tutorSession.startedAt })
      .from(tutorSession)
      .where(eq(tutorSession.userId, bootstrapUser.id));

    if (sessions.length === 0) {
      return {
        subject: subjectKey,
        totals: { attempted: 0, wrong: 0, missRate: 0 },
        focusAreas: []
      };
    }

    const sessionIds = sessions.map((s) => s.id);
    const startedBySession = new Map(sessions.map((s) => [s.id, s.startedAt]));

    const reports = await db()
      .select({
        sessionId: sessionReport.sessionId,
        questions: sessionReport.questions
      })
      .from(sessionReport)
      .where(and(eq(sessionReport.status, 'ready'), inArray(sessionReport.sessionId, sessionIds)));

    let attempted = 0;
    let wrong = 0;
    const focusAreaMap = new Map();

    for (const r of reports) {
      const questions = Array.isArray(r.questions) ? r.questions : [];
      for (const q of questions) {
        if (q.nswSubject !== nswSubject) continue;
        const studentWroteSomething = q.studentAnswer && q.studentAnswer.trim() !== '';
        if (!studentWroteSomething && q.correct !== false) continue;
        attempted += 1;
        const struggled = isStruggled(q);
        if (struggled) wrong += 1;

        const faKey = q.nswFocusArea || 'Uncategorized';
        let bucket = focusAreaMap.get(faKey);
        if (!bucket) {
          bucket = {
            focusArea: faKey,
            strand: q.nswStrand || null,
            attempted: 0,
            wrong: 0,
            outcomes: new Map(),
            questions: []
          };
          focusAreaMap.set(faKey, bucket);
        }
        bucket.attempted += 1;
        if (struggled) bucket.wrong += 1;

        const code = q.nswOutcomeCode || 'UNKNOWN';
        let outcome = bucket.outcomes.get(code);
        if (!outcome) {
          outcome = {
            code,
            text: q.nswOutcomeText || '',
            stage: q.nswStage || null,
            attempted: 0,
            wrong: 0
          };
          bucket.outcomes.set(code, outcome);
        }
        outcome.attempted += 1;
        if (struggled) outcome.wrong += 1;

        if (struggled) {
          bucket.questions.push({
            sessionId: r.sessionId,
            sessionStartedAt: startedBySession.get(r.sessionId) ?? null,
            question: q.question || '',
            studentAnswer: q.studentAnswer || '',
            correctAnswer: q.correctAnswer || '',
            correct: q.correct,
            mistakeType: q.mistakeType || null,
            mistakeNotes: q.mistakeNotes || '',
            outcomeCode: code
          });
        }
      }
    }

    const focusAreas = Array.from(focusAreaMap.values())
      .map((b) => ({
        focusArea: b.focusArea,
        strand: b.strand,
        attempted: b.attempted,
        wrong: b.wrong,
        missRate: b.attempted > 0 ? b.wrong / b.attempted : 0,
        outcomes: Array.from(b.outcomes.values())
          .map((o) => ({ ...o, missRate: o.attempted > 0 ? o.wrong / o.attempted : 0 }))
          .sort((a, b) => b.wrong - a.wrong || b.attempted - a.attempted),
        questions: b.questions.sort((a, b) => {
          const ta = a.sessionStartedAt ? new Date(a.sessionStartedAt).getTime() : 0;
          const tb = b.sessionStartedAt ? new Date(b.sessionStartedAt).getTime() : 0;
          return tb - ta;
        })
      }))
      .sort((a, b) => b.wrong - a.wrong || b.attempted - a.attempted);

    return {
      subject: subjectKey,
      totals: {
        attempted,
        wrong,
        missRate: attempted > 0 ? wrong / attempted : 0
      },
      focusAreas
    };
  });
}
