import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, eq } from 'drizzle-orm';
import db from '../db/index.js';
import {
  sessionDoc,
  sessionImage,
  sessionMessage,
  tutorSession
} from '../db/schema.js';
import brainTools from '../lib/brainTools.js';
import buildUserMessageWithImages from '../lib/buildUserMessageWithImages.js';
import makeTutorTools from '../lib/makeTutorTools.js';
import { normaliseUsage, recordLlmUsageBatch, sumUsage } from '../lib/recordLlmUsage.js';
import runBrainTurn from '../lib/runBrainTurn.js';
import tutorPrompt from '../lib/tutorPrompt.js';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Corrective prompt sent on the phantom-annotation retry. Stored as a
// markdown resource so it can be edited without touching code.
const PHANTOM_ANNOTATION_RETRY_PROMPT = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../prompts/phantomAnnotationRetry.md'
  ),
  'utf8'
).trimEnd();

// Catches first-person claims of having drawn on the page. Used to detect
// the hallucination case where Brain narrates a highlight it never actually
// produced via draw_annotation. Intentionally first-person ("I've") only —
// "the student highlighted" or "the page has a circle around" are legitimate
// descriptions of someone else's marks.
const ANNOTATION_NARRATION_RE =
  /\bI(?:'ve| have| 've)?\s+(?:just|now|already)?\s*(?:put\s+(?:a|an)\s+\w+\s+(?:highlight|circle|box|mark)|highlighted|circled|underlined|marked|drawn?\s+(?:a\s+)?(?:circle|box|highlight))\b/i;

function looksLikeAnnotationAnnouncement(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return ANNOTATION_NARRATION_RE.test(text);
}

// Strip every phantom-highlight sentence from a string, splitting on
// sentence terminators and newlines and dropping any segment that matches
// the narration regex. Used both for cleaning past assistant messages
// before re-feeding Brain (so the lie doesn't reinforce itself across
// turns) and as a belt-and-suspenders scrub on the live turn's content
// before it lands in the DB. May return an empty string if the entire
// message was the false claim.
function stripPhantomAnnotationNarration(content) {
  if (typeof content !== 'string' || content.length === 0) return content;
  if (!ANNOTATION_NARRATION_RE.test(content)) return content;
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => !ANNOTATION_NARRATION_RE.test(s))
    .join(' ')
    .trim();
}

// Scrub phantom-highlight narration off an assistant row before feeding
// it back to Brain. Skipped when the row actually had a draw_annotation
// call (the narration was grounded), so legitimate "I've highlighted X"
// sentences stay intact.
function sanitizeAssistantContentForBrain(row) {
  const content = typeof row.content === 'string' ? row.content : '';
  if (!content) return content;
  const hadDrawAnnotation =
    Array.isArray(row.toolCalls) && row.toolCalls.some((c) => c?.name === 'draw_annotation');
  if (hadDrawAnnotation) return content;
  return stripPhantomAnnotationNarration(content);
}

function brainConfig() {
  return {
    baseUrl: process.env.YTAI_OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL,
    apiKey: process.env.YTAI_OPENROUTER_API_KEY || '',
    model: process.env.YTAI_OPENROUTER_CHAT_MODEL || 'deepseek/deepseek-chat'
  };
}

function collectUsedColors(history) {
  const seen = new Set();
  for (const row of history) {
    const calls = Array.isArray(row.toolCalls) ? row.toolCalls : [];
    for (const tc of calls) {
      if (tc?.name !== 'draw_annotation') continue;
      const name =
        typeof tc.args?.colorName === 'string'
          ? tc.args.colorName.toLowerCase()
          : typeof tc.args?.color === 'string' && /^[a-z]+$/i.test(tc.args.color)
            ? tc.args.color.toLowerCase()
            : null;
      if (name) seen.add(name);
    }
  }
  return Array.from(seen);
}

// Load the session's current doc with all its pages (one row per page,
// ordered 1..N). Returns null when the session has no doc yet — a text-
// only conversation where Brain answers without the worksheet.
async function loadActiveDoc(currentDocId) {
  if (!currentDocId) return null;
  const [doc] = await db()
    .select({
      id: sessionDoc.id,
      kind: sessionDoc.kind,
      pageCount: sessionDoc.pageCount
    })
    .from(sessionDoc)
    .where(eq(sessionDoc.id, currentDocId));
  if (!doc) return null;

  const pages = await db()
    .select({
      id: sessionImage.id,
      pageNumber: sessionImage.pageNumber,
      width: sessionImage.width,
      height: sessionImage.height,
      storageUrl: sessionImage.storageUrl
    })
    .from(sessionImage)
    .where(eq(sessionImage.docId, currentDocId))
    .orderBy(asc(sessionImage.pageNumber));

  if (pages.length === 0) return null;
  return { id: doc.id, kind: doc.kind, pages };
}

// Decode `data:image/...;base64,...` into a raw byte Buffer. Returns null
// for malformed or unsupported inputs. Used to validate the per-turn
// annotated canvas the frontend ships when the student has marked the page.
function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0) return null;
    return { mimeType: match[1], bytes };
  } catch {
    return null;
  }
}

export default function tutorSendMessage(fastify) {
  fastify.post('/api/tutor/:sessionId/message', async (request, reply) => {
    const { sessionId } = request.params;
    const userId = request.userId;
    const content = typeof request.body?.content === 'string' ? request.body.content.trim() : '';
    // Frontend hint: which page of the doc the student is currently
    // looking at. Passed into the prompt so Brain biases page-specific
    // lookups toward what the student is staring at. Optional.
    const viewingPage = Number.isInteger(request.body?.viewingPage)
      ? Math.max(1, request.body.viewingPage)
      : null;
    // Per-turn ephemeral canvas snapshot: { imageId, dataUrl } where the
    // dataUrl is a PNG of (photo + freehand strokes) the student drew on
    // the active page. Not persisted — these bytes substitute for the
    // original page in Brain's multimodal user message so Brain sees what
    // the student circled. Absent when the canvas is clean.
    const annotatedImageRaw = request.body?.annotatedImage;
    const annotatedImage =
      annotatedImageRaw &&
      typeof annotatedImageRaw === 'object' &&
      typeof annotatedImageRaw.imageId === 'string' &&
      typeof annotatedImageRaw.dataUrl === 'string'
        ? annotatedImageRaw
        : null;

    if (!content) {
      reply.code(400);
      return { error: 'content is required' };
    }

    const [session] = await db()
      .select({
        id: tutorSession.id,
        currentDocId: tutorSession.currentDocId,
        guidanceLevel: tutorSession.guidanceLevel,
        subject: tutorSession.subject
      })
      .from(tutorSession)
      .where(and(eq(tutorSession.id, sessionId), eq(tutorSession.userId, userId)));

    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const activeDoc = await loadActiveDoc(session.currentDocId);

    // Build the per-imageId annotated-bytes map for this turn. Only honor an
    // annotated image whose imageId belongs to a page of the active doc —
    // a stale imageId from a switched-out doc gets dropped, not trusted.
    // We store the raw Buffer + mimeType — buildUserMessageWithImages
    // encodes the data URL only when it's actually attaching the page.
    const annotatedByImageId = new Map();
    if (annotatedImage && activeDoc) {
      const pageMatch = activeDoc.pages.find((p) => p.id === annotatedImage.imageId);
      if (pageMatch) {
        const decoded = decodeImageDataUrl(annotatedImage.dataUrl);
        if (decoded) {
          annotatedByImageId.set(pageMatch.id, {
            bytes: decoded.bytes,
            mimeType: decoded.mimeType
          });
        } else {
          request.log.warn(
            { sessionId, imageId: annotatedImage.imageId },
            'annotatedImage: malformed dataUrl — falling back to original photo'
          );
        }
      } else {
        request.log.warn(
          { sessionId, imageId: annotatedImage.imageId, activeDocId: activeDoc.id },
          'annotatedImage: imageId not in active doc — ignoring'
        );
      }
    }

    request.log.info(
      {
        sessionId,
        currentDocId: session.currentDocId,
        pageCount: activeDoc?.pages.length ?? 0,
        viewingPage,
        annotatedPages: Array.from(annotatedByImageId.keys())
      },
      'turn start'
    );

    const history = await db()
      .select({
        role: sessionMessage.role,
        content: sessionMessage.content,
        toolCalls: sessionMessage.toolCalls
      })
      .from(sessionMessage)
      .where(eq(sessionMessage.sessionId, sessionId))
      .orderBy(asc(sessionMessage.createdAt));

    // Colors Brain has already used for draw_annotation this session. We feed
    // these back to it via the system prompt so it can pick a fresh palette
    // entry on the next mark.
    const usedColors = collectUsedColors(history);
    const usedColorsForTurn = new Set(usedColors);

    const [userRow] = await db()
      .insert(sessionMessage)
      .values({
        sessionId,
        role: 'user',
        content,
        imageId: null
      })
      .returning({ id: sessionMessage.id, createdAt: sessionMessage.createdAt });

    // Page numbers the student annotated this turn — fed into the system
    // prompt so Brain knows to ask Eyes about the marks instead of insisting
    // it sees none.
    const annotatedPageNumbers = activeDoc
      ? activeDoc.pages
          .filter((p) => annotatedByImageId.has(p.id))
          .map((p) => p.pageNumber)
      : [];

    const promptMessages = await tutorPrompt({
      activeDoc,
      viewingPage,
      usedColors,
      guidanceLevel: session.guidanceLevel,
      subject: session.subject,
      annotatedPages: annotatedPageNumbers
    });

    // The latest user message carries every page of the active doc as
    // multimodal content so Brain can read the worksheet directly. Earlier
    // turns stay text-only — Brain sees the worksheet fresh each turn, and
    // prior assistant replies just describe what was seen.
    let latestUserContent = content;
    if (activeDoc) {
      const multimodalContent = await buildUserMessageWithImages({
        activeDoc,
        annotatedByImageId,
        text: content,
        log: request.log
      });
      if (multimodalContent) {
        latestUserContent = multimodalContent;
      } else {
        request.log.warn(
          { sessionId, activeDocId: activeDoc.id },
          'no page bytes resolvable — falling back to text-only user message'
        );
      }
    }

    const modelMessages = [
      ...promptMessages,
      // Skip empty-content rows: those are image-attachment markers for the
      // UI (legacy single-image sessions), not anything Brain needs in its
      // conversational context. For prior assistant turns, strip phantom-
      // highlight narration that wasn't backed by a real draw_annotation
      // call — otherwise the lie compounds across turns as Brain treats
      // its own past hallucinations as a template.
      ...history
        .map((m) => {
          if (m.role === 'assistant') {
            return { role: m.role, content: sanitizeAssistantContentForBrain(m) };
          }
          return { role: m.role, content: m.content };
        })
        .filter((m) => m.content),
      { role: 'user', content: latestUserContent }
    ];

    const { baseUrl, apiKey, model: modelId } = brainConfig();

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    let clientClosed = false;
    function sse(event, data) {
      if (clientClosed) return;
      try {
        raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        clientClosed = true;
      }
    }

    sse('user', {
      id: userRow.id,
      role: 'user',
      content,
      imageId: null,
      createdAt: userRow.createdAt
    });

    const abortController = new AbortController();
    request.raw.on('close', () => {
      clientClosed = true;
      abortController.abort();
    });

    const dispatchTool = makeTutorTools({
      activeDoc,
      viewingPage,
      log: request.log,
      emit: sse,
      usedColorsForTurn
    });

    let {
      assistantContent,
      allToolCalls,
      usageRecords,
      interrupted,
      error: turnError
    } = await runBrainTurn({
      baseUrl,
      apiKey,
      model: modelId,
      messages: modelMessages,
      tools: activeDoc ? brainTools : undefined,
      signal: abortController.signal,
      log: request.log,
      logFields: { sessionId },
      dispatchTool,
      onToken: (delta) => sse('token', { delta })
    });

    if (turnError) {
      request.log.error({ err: turnError, sessionId }, 'Chat stream failed');
    }

    // Hallucination correction: when Brain writes "I've highlighted X in
    // yellow…" but never called draw_annotation, retry once. The student
    // would otherwise see a phantom announcement with no mark on the page.
    // Only retry on a clean turn — skip when the stream was interrupted or
    // already failed.
    const drewSomething = allToolCalls.some((c) => c.name === 'draw_annotation');
    const phantomAnnotation =
      !drewSomething &&
      !interrupted &&
      !turnError &&
      looksLikeAnnotationAnnouncement(assistantContent);

    if (phantomAnnotation) {
      request.log.warn(
        { sessionId, contentPreview: assistantContent.slice(0, 200) },
        'Brain narrated a highlight without calling draw_annotation — retrying once'
      );

      // Tell the UI to clear the in-progress assistant bubble and stop
      // speaking the discarded sentence. The retry's tokens stream into
      // the same (now empty) bubble.
      sse('retry', { reason: 'phantom-annotation' });

      // Synthesize the first attempt as an assistant turn so Brain sees
      // what it said, then ask for a corrected reply. Two-message form
      // (assistant + user) reads more naturally than appending a bare
      // corrective user message after the original prompt.
      modelMessages.push({ role: 'assistant', content: assistantContent });
      modelMessages.push({ role: 'user', content: PHANTOM_ANNOTATION_RETRY_PROMPT });

      const retryResult = await runBrainTurn({
        baseUrl,
        apiKey,
        model: modelId,
        messages: modelMessages,
        tools: activeDoc ? brainTools : undefined,
        signal: abortController.signal,
        log: request.log,
        logFields: { sessionId, retry: 'phantom-annotation' },
        dispatchTool,
        onToken: (delta) => sse('token', { delta })
      });

      // Discard the first attempt's content; keep both attempts' usage
      // (we paid for both) and tool-call audit (intermediate lookups from
      // the first attempt still happened and matter for the record).
      assistantContent = retryResult.assistantContent;
      allToolCalls = [...allToolCalls, ...retryResult.allToolCalls];
      usageRecords = [...usageRecords, ...retryResult.usageRecords];
      interrupted = retryResult.interrupted;
      turnError = retryResult.error;

      if (turnError) {
        request.log.error({ err: turnError, sessionId }, 'Retry Brain turn failed');
      }
    }

    // Belt-and-suspenders: if the (retried or original) reply STILL claims
    // a mark with no backing draw_annotation, drop the offending sentence
    // before persisting rather than capping the lie in the transcript. May
    // empty the message entirely if the entire reply was the false claim
    // — handled by the existing "no content" branch below.
    const finalDrewSomething = allToolCalls.some((c) => c.name === 'draw_annotation');
    if (!finalDrewSomething && looksLikeAnnotationAnnouncement(assistantContent)) {
      const scrubbed = stripPhantomAnnotationNarration(assistantContent);
      request.log.warn(
        {
          sessionId,
          before: assistantContent.slice(0, 200),
          after: scrubbed.slice(0, 200)
        },
        'Phantom annotation narration survived retry — scrubbing sentence before persistence'
      );
      assistantContent = scrubbed;
    }

    // Roll Brain rounds into one bill for this assistant message. The
    // audit-table inserts happen after the row is created so every
    // llm_usage record has the right messageId FK.
    const brainNormalised = (usageRecords ?? []).map((r) => normaliseUsage(r.usage));
    const turnTotals = sumUsage(brainNormalised);

    try {
      const [assistantRow] = await db()
        .insert(sessionMessage)
        .values({
          sessionId,
          role: 'assistant',
          content: assistantContent,
          provider: 'openrouter',
          modelId,
          imageId: null,
          inputTokens: turnTotals.inputTokens || null,
          outputTokens: turnTotals.outputTokens || null,
          reasoningTokens: turnTotals.reasoningTokens || null,
          cacheReadTokens: turnTotals.cacheReadTokens || null,
          cacheWriteTokens: turnTotals.cacheWriteTokens || null,
          costUsd: turnTotals.costUsd,
          interrupted,
          toolCalls: allToolCalls.length > 0 ? allToolCalls : null
        })
        .returning({ id: sessionMessage.id, createdAt: sessionMessage.createdAt });

      // Best-effort audit log — one row per Brain round that hit the
      // network. Batched into a single INSERT so a multi-round turn is one
      // DB round-trip, not N+1.
      const auditRecords = (usageRecords ?? []).map((rec) => ({
        userId,
        sessionId,
        messageId: assistantRow.id,
        purpose: 'brain_chat',
        model: modelId,
        modelVersion: rec.modelVersion,
        usage: rec.usage
      }));
      recordLlmUsageBatch(auditRecords, request.log).catch((err) => {
        request.log.warn({ err: err?.message, sessionId }, 'recordLlmUsageBatch background job rejected');
      });

      if (turnError) {
        sse('error', {
          error: turnError.message?.slice(0, 600) || 'The tutor lost its train of thought. Try again?'
        });
      } else if (!assistantContent && !interrupted) {
        // Catches both the round-cap-hit case and the case where Brain
        // emitted nothing even after forceTextOnly + emptyStopRecovery tried
        // to coax a reply out of it. Either way the student is staring at a
        // blank bubble — give them something useful instead.
        sse('error', {
          error:
            "Hmm, I couldn't put together an answer for that one. Could you say a bit more about " +
            'what you want help with? (For example: which question, and what part is confusing.)'
        });
      } else {
        sse('done', {
          messageId: assistantRow.id,
          inputTokens: turnTotals.inputTokens || null,
          outputTokens: turnTotals.outputTokens || null,
          reasoningTokens: turnTotals.reasoningTokens || null,
          cacheReadTokens: turnTotals.cacheReadTokens || null,
          cacheWriteTokens: turnTotals.cacheWriteTokens || null,
          costUsd: turnTotals.costUsd,
          interrupted,
          // 'done' payload keeps its historical shape: only the UI-facing
          // draw_annotation calls. The full lookup chain lives in DB.
          toolCalls: allToolCalls.filter((c) => c.name === 'draw_annotation'),
          createdAt: assistantRow.createdAt
        });
      }
    } catch (err) {
      request.log.error({ err, sessionId }, 'Failed to persist assistant message');
      sse('error', { error: 'Failed to save the reply.' });
    }

    if (!clientClosed) {
      try {
        raw.end();
      } catch {
        // socket already gone
      }
    }
  });
}
