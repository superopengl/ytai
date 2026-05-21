import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import db from '../db/index.js';
import {
  imageOcr,
  sessionImage,
  sessionMessage,
  sessionReport,
  tutorSession,
  visionExtraction
} from '../db/schema.js';
import agentChat from './agentChat.js';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const CATALOG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/nswSyllabus.json'
);
// Loaded once. Edit src/api/data/nswSyllabus.json and restart the server to
// refresh. Keep as a string — it goes verbatim into the system prompt.
const CATALOG_RAW = readFileSync(CATALOG_PATH, 'utf8');
const CATALOG = JSON.parse(CATALOG_RAW);

const VALID_CODES = (() => {
  const codes = new Set();
  for (const stage of CATALOG.stages) {
    for (const subject of stage.subjects) {
      for (const outcome of subject.outcomes) codes.add(outcome.code);
    }
  }
  return codes;
})();

const CODE_LOOKUP = (() => {
  const map = new Map();
  for (const stage of CATALOG.stages) {
    for (const subject of stage.subjects) {
      for (const outcome of subject.outcomes) {
        map.set(outcome.code, {
          code: outcome.code,
          text: outcome.text,
          strand: outcome.strand || null,
          focusArea: outcome.focusArea,
          stage: stage.stage,
          subject: subject.subject
        });
      }
    }
  }
  return map;
})();

const MISTAKE_TYPES = new Set([
  'conceptual',
  'computational',
  'careless',
  'misread-question',
  'incomplete'
]);

const SUBMIT_REPORT_TOOL = {
  type: 'function',
  function: {
    name: 'submit_report',
    description:
      'Submit the structured session report for the parent/teacher view. Call this exactly once with every question the student worked on during the session.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: {
          type: 'string',
          description:
            'Two or three sentences describing what the student worked on this session, how they did, and one concrete next step. Write to the parent/teacher, not the student.'
        },
        subject: {
          type: 'string',
          enum: ['Mathematics', 'English', 'Mixed', 'Unknown'],
          description: 'The dominant subject of the worksheet.'
        },
        stage: {
          type: 'string',
          enum: ['Stage 2', 'Stage 3', 'Stage 4', 'Unknown'],
          description:
            'Best guess at the NSW stage. Stage 2 = Y3-4, Stage 3 = Y5-6, Stage 4 = Y7-8. Use Unknown only if there really is no signal.'
        },
        questions: {
          type: 'array',
          description:
            'Every distinct question on the worksheet that came up during the session. Skip greetings and off-topic chat. If the student did not actually attempt a question, set studentAnswer to "" and correct to null.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              question: {
                type: 'string',
                description: 'The question as it appears on the worksheet, paraphrased only if necessary for clarity.'
              },
              studentAnswer: {
                type: 'string',
                description: 'What the student wrote on the page or said in chat. Empty string if no attempt.'
              },
              correctAnswer: {
                type: 'string',
                description: 'The correct answer. Empty string if you cannot determine it.'
              },
              correct: {
                type: ['boolean', 'null'],
                description: 'true if the student answered correctly, false if wrong, null if no attempt or unclear.'
              },
              mistakeType: {
                type: ['string', 'null'],
                enum: ['conceptual', 'computational', 'careless', 'misread-question', 'incomplete', null],
                description:
                  'Category of the error. conceptual = misunderstood the underlying idea. computational = arithmetic slip. careless = transcription / sign error. misread-question = answered a different question than asked. incomplete = stopped partway. null when the student got it right or did not attempt.'
              },
              mistakeNotes: {
                type: 'string',
                description: 'One short sentence describing the specific mistake, or "" if no mistake.'
              },
              nswOutcomeCode: {
                type: 'string',
                description:
                  'NSW K-10 Syllabus (2022) outcome code from the catalog. Pick the single best match. Use the exact code string (e.g. "MA2-MR-01", "EN3-CWT-01", "MA4-PYT-C-01").'
              }
            },
            required: [
              'question',
              'studentAnswer',
              'correctAnswer',
              'correct',
              'mistakeType',
              'mistakeNotes',
              'nswOutcomeCode'
            ]
          }
        }
      },
      required: ['summary', 'subject', 'stage', 'questions']
    }
  }
};

function reporterConfig() {
  return {
    baseUrl: process.env.YTAI_OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL,
    apiKey: process.env.YTAI_OPENROUTER_API_KEY || '',
    model: process.env.YTAI_OPENROUTER_CHAT_MODEL || 'deepseek/deepseek-chat'
  };
}

async function loadSessionContext(sessionId, { sinceMessageAt } = {}) {
  const whereClause = sinceMessageAt
    ? and(
        eq(sessionMessage.sessionId, sessionId),
        gt(sessionMessage.createdAt, sinceMessageAt)
      )
    : eq(sessionMessage.sessionId, sessionId);

  const messages = await db()
    .select({
      id: sessionMessage.id,
      role: sessionMessage.role,
      content: sessionMessage.content,
      imageId: sessionMessage.imageId,
      toolCalls: sessionMessage.toolCalls,
      createdAt: sessionMessage.createdAt
    })
    .from(sessionMessage)
    .where(whereClause)
    .orderBy(asc(sessionMessage.createdAt));

  // Pull image IDs from the session's docs so the report sees every page
  // the student worked on, not just images embedded in legacy messages.
  const sessionImages = await db()
    .select({ id: sessionImage.id })
    .from(sessionImage)
    .where(eq(sessionImage.sessionId, sessionId));
  const imageIds = Array.from(new Set(sessionImages.map((r) => r.id)));

  const ocrRows = imageIds.length
    ? await db()
        .select({ imageId: imageOcr.imageId, status: imageOcr.status, lines: imageOcr.lines })
        .from(imageOcr)
        .where(and(eq(imageOcr.status, 'ready')))
    : [];

  const visionRows = imageIds.length
    ? await db()
        .select({ imageId: visionExtraction.imageId, extracted: visionExtraction.extracted })
        .from(visionExtraction)
    : [];

  return {
    messages,
    ocrRows: ocrRows.filter((r) => imageIds.includes(r.imageId)),
    visionRows: visionRows.filter((r) => imageIds.includes(r.imageId))
  };
}

function transcriptToText(messages) {
  const out = [];
  for (const m of messages) {
    if (!m.content || !m.content.trim()) continue;
    const speaker = m.role === 'assistant' ? 'Tutor' : m.role === 'user' ? 'Student' : m.role;
    out.push(`${speaker}: ${m.content.trim()}`);
  }
  return out.join('\n\n');
}

function ocrToText(ocrRows) {
  if (!ocrRows.length) return '';
  const lines = [];
  for (const row of ocrRows) {
    if (!Array.isArray(row.lines)) continue;
    for (const ln of row.lines) {
      if (ln?.text) lines.push(ln.text);
    }
  }
  return lines.join('\n');
}

function visionQAToText(visionRows) {
  if (!visionRows.length) return '';
  const out = [];
  for (const row of visionRows) {
    const e = row.extracted;
    if (!e) continue;
    if (typeof e.question === 'string' && typeof e.answer === 'string') {
      out.push(`Q: ${e.question}\nA: ${e.answer}`);
    }
  }
  return out.join('\n\n');
}

function buildMessages({ transcript, ocrText, visionText, priorQuestions }) {
  const isIncremental = Array.isArray(priorQuestions) && priorQuestions.length > 0;
  const incrementalNote = isIncremental
    ? ' This is an incremental update. The student has continued the session since the last report. You are given the prior list of questions and only the NEW chat messages since then. Return a MERGED list: keep any prior question that still belongs (updating its correct/mistakeType if a later interaction changes the verdict — e.g. the student initially got it wrong and then got it right after scaffolding), and add any new questions that came up. Do not drop prior questions just because they are not mentioned in the new transcript chunk.'
    : '';

  const system =
    'You are generating a post-session report for a parent or teacher reviewing their kid\'s tutoring session on YouTutorAI. ' +
    'Your job is to extract the worksheet questions the student worked on, judge correctness, classify any mistake, and tag each question to a single NSW K-10 Syllabus (2022) outcome code from the catalog below. ' +
    'Be honest and specific. If the student got something right, say so. If you cannot determine the correct answer from the transcript, leave correctAnswer empty rather than guessing. ' +
    'Write the summary to an adult — not to the student. ' +
    'Call the submit_report tool exactly once and do not write any other text.' +
    incrementalNote +
    '\n\nNSW K-10 Syllabus (2022) outcome catalog — pick nswOutcomeCode from this list only:\n\n' +
    CATALOG_RAW;

  const userParts = [];
  if (ocrText) userParts.push(`### Worksheet text (OCR)\n${ocrText}`);
  if (visionText) userParts.push(`### What the vision model saw on the page\n${visionText}`);
  if (isIncremental) {
    userParts.push(
      `### Prior report — questions already captured (merge with the transcript below)\n${JSON.stringify(priorQuestions, null, 2)}`
    );
    userParts.push(`### New transcript since last report\n${transcript || '(no new chat messages)'}`);
  } else {
    userParts.push(`### Tutoring transcript\n${transcript || '(no chat messages)'}`);
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') }
  ];
}

async function callReporter({ messages, baseUrl, apiKey, model }) {
  const accum = new Map();
  let finishReason = null;
  let usage = null;

  for await (const chunk of agentChat({
    baseUrl,
    apiKey,
    model,
    messages,
    tools: [SUBMIT_REPORT_TOOL]
  })) {
    if (chunk.toolCallChunks) {
      for (const tc of chunk.toolCallChunks) {
        const idx = tc.index ?? 0;
        let acc = accum.get(idx);
        if (!acc) {
          acc = { id: tc.id || `call_${idx}`, name: '', argsRaw: '' };
          accum.set(idx, acc);
        }
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (typeof tc.function?.arguments === 'string') acc.argsRaw += tc.function.arguments;
      }
    }
    if (chunk.finishReason) finishReason = chunk.finishReason;
    if (chunk.usage) usage = chunk.usage;
  }

  const call = Array.from(accum.values()).find((c) => c.name === 'submit_report');
  if (!call) {
    throw new Error(`Reporter returned no submit_report tool call (finishReason=${finishReason})`);
  }
  let args;
  try {
    args = JSON.parse(call.argsRaw || '{}');
  } catch (err) {
    throw new Error(`Reporter submit_report args were not valid JSON: ${err.message}`);
  }
  return { args, usage };
}

// Drop questions with codes the model invented, and enrich every kept
// question with the catalog text so the UI doesn't have to load the JSON.
function normalizeReport(args, { log }) {
  const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
  const subject = typeof args.subject === 'string' ? args.subject : 'Unknown';
  const stage = typeof args.stage === 'string' ? args.stage : 'Unknown';
  const rawQuestions = Array.isArray(args.questions) ? args.questions : [];

  const questions = [];
  for (const q of rawQuestions) {
    const code = typeof q?.nswOutcomeCode === 'string' ? q.nswOutcomeCode.trim() : '';
    if (!code) continue;
    if (!VALID_CODES.has(code)) {
      log.warn({ code, question: q?.question }, 'reporter picked an unknown NSW code — dropping');
      continue;
    }
    const meta = CODE_LOOKUP.get(code);
    const mistakeType =
      typeof q.mistakeType === 'string' && MISTAKE_TYPES.has(q.mistakeType) ? q.mistakeType : null;
    questions.push({
      question: typeof q.question === 'string' ? q.question : '',
      studentAnswer: typeof q.studentAnswer === 'string' ? q.studentAnswer : '',
      correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : '',
      correct: typeof q.correct === 'boolean' ? q.correct : null,
      mistakeType,
      mistakeNotes: typeof q.mistakeNotes === 'string' ? q.mistakeNotes : '',
      nswOutcomeCode: code,
      nswOutcomeText: meta.text,
      nswStrand: meta.strand,
      nswFocusArea: meta.focusArea,
      nswStage: meta.stage,
      nswSubject: meta.subject
    });
  }
  return { summary, subject, stage, questions };
}

// Returns { id, createdAt } of the most recent session_message, or null.
async function latestMessage(sessionId) {
  const rows = await db()
    .select({ id: sessionMessage.id, createdAt: sessionMessage.createdAt })
    .from(sessionMessage)
    .where(eq(sessionMessage.sessionId, sessionId))
    .orderBy(desc(sessionMessage.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export default async function generateSessionReport({ sessionId, log, force = false }) {
  const [session] = await db()
    .select({ id: tutorSession.id })
    .from(tutorSession)
    .where(eq(tutorSession.id, sessionId));
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const [existing] = await db()
    .select({
      status: sessionReport.status,
      summary: sessionReport.summary,
      questions: sessionReport.questions,
      cursorMessageId: sessionReport.cursorMessageId,
      cursorMessageAt: sessionReport.cursorMessageAt
    })
    .from(sessionReport)
    .where(eq(sessionReport.sessionId, sessionId));

  const latest = await latestMessage(sessionId);

  // Fast path: existing ready report already at the head. Nothing to do.
  if (
    !force &&
    existing?.status === 'ready' &&
    latest &&
    existing.cursorMessageId === latest.id
  ) {
    return {
      status: 'ready',
      summary: existing.summary || '',
      subject: 'Unknown',
      stage: 'Unknown',
      questions: Array.isArray(existing.questions) ? existing.questions : [],
      fresh: false
    };
  }

  // Decide between incremental and full rebuild. Incremental needs a
  // ready prior report with a cursor that still resolves to a real
  // message. Otherwise rebuild from scratch.
  const canIncrement =
    !force &&
    existing?.status === 'ready' &&
    Array.isArray(existing.questions) &&
    existing.cursorMessageId &&
    existing.cursorMessageAt;

  await db()
    .insert(sessionReport)
    .values({ sessionId, status: 'pending' })
    .onConflictDoUpdate({
      target: sessionReport.sessionId,
      set: { status: 'pending', error: null, updatedAt: new Date() }
    });

  try {
    const { messages, ocrRows, visionRows } = await loadSessionContext(
      sessionId,
      canIncrement ? { sinceMessageAt: existing.cursorMessageAt } : undefined
    );
    const transcript = transcriptToText(messages);
    const ocrText = ocrToText(ocrRows);
    const visionText = visionQAToText(visionRows);

    if (!transcript && !ocrText && !visionText && !canIncrement) {
      const empty = {
        summary: 'No activity recorded for this session yet.',
        subject: 'Unknown',
        stage: 'Unknown',
        questions: []
      };
      await db()
        .update(sessionReport)
        .set({
          status: 'ready',
          summary: empty.summary,
          questions: empty.questions,
          cursorMessageId: latest?.id ?? null,
          cursorMessageAt: latest?.createdAt ?? null,
          updatedAt: new Date()
        })
        .where(eq(sessionReport.sessionId, sessionId));
      return { ...empty, status: 'ready', fresh: true };
    }

    // Incremental with no new messages: nothing changed since the cursor.
    // (Shouldn't happen given the staleness check above, but handle the
    // race where messages got rolled back, etc.)
    if (canIncrement && !transcript) {
      await db()
        .update(sessionReport)
        .set({
          status: 'ready',
          cursorMessageId: latest?.id ?? existing.cursorMessageId,
          cursorMessageAt: latest?.createdAt ?? existing.cursorMessageAt,
          updatedAt: new Date()
        })
        .where(eq(sessionReport.sessionId, sessionId));
      return {
        status: 'ready',
        summary: existing.summary || '',
        subject: 'Unknown',
        stage: 'Unknown',
        questions: existing.questions,
        fresh: false
      };
    }

    const promptMessages = buildMessages({
      transcript,
      ocrText,
      visionText,
      priorQuestions: canIncrement ? existing.questions : null
    });
    const { baseUrl, apiKey, model } = reporterConfig();
    log.info(
      {
        sessionId,
        model,
        incremental: canIncrement,
        transcriptChars: transcript.length,
        ocrChars: ocrText.length,
        priorQuestions: canIncrement ? existing.questions.length : 0
      },
      'generateSessionReport: calling Brain'
    );
    const { args, usage } = await callReporter({ messages: promptMessages, baseUrl, apiKey, model });
    const normalized = normalizeReport(args, { log });

    await db()
      .update(sessionReport)
      .set({
        status: 'ready',
        summary: normalized.summary,
        questions: normalized.questions,
        cursorMessageId: latest?.id ?? null,
        cursorMessageAt: latest?.createdAt ?? null,
        modelVersion: model,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        error: null,
        updatedAt: new Date()
      })
      .where(eq(sessionReport.sessionId, sessionId));

    return {
      status: 'ready',
      summary: normalized.summary,
      subject: normalized.subject,
      stage: normalized.stage,
      questions: normalized.questions,
      fresh: true
    };
  } catch (err) {
    log.error({ err, sessionId }, 'generateSessionReport failed');
    await db()
      .update(sessionReport)
      .set({
        status: 'failed',
        error: err.message?.slice(0, 500) || 'unknown error',
        updatedAt: new Date()
      })
      .where(eq(sessionReport.sessionId, sessionId));
    throw err;
  }
}
