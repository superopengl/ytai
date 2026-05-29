import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import db from '../db/index.js';
import {
  sessionDoc,
  sessionImage,
  sessionMessage,
  tutorSession
} from '../db/schema.js';
import brainTools from '../lib/brainTools.js';
import ensureImageOcr from '../lib/ensureImageOcr.js';
import makeTutorTools from '../lib/makeTutorTools.js';
import { normaliseUsage, recordLlmUsageBatch, sumUsage } from '../lib/recordLlmUsage.js';
import runBrainTurn from '../lib/runBrainTurn.js';
import tutorPrompt from '../lib/tutorPrompt.js';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

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

// Strip phantom-highlight sentences from a past assistant message before
// feeding it back to Brain. If an earlier turn narrated a highlight without
// actually calling draw_annotation, leaving that sentence in the model's
// conversation history teaches it the lie is a valid pattern — next turn it
// copies the form. Returns the cleaned content (which may be empty if the
// entire message was the false claim).
function sanitizeAssistantContentForBrain(row) {
  const content = typeof row.content === 'string' ? row.content : '';
  if (!content) return content;
  const hadDrawAnnotation =
    Array.isArray(row.toolCalls) && row.toolCalls.some((c) => c?.name === 'draw_annotation');
  if (hadDrawAnnotation) return content;
  if (!ANNOTATION_NARRATION_RE.test(content)) return content;
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => !ANNOTATION_NARRATION_RE.test(s))
    .join(' ')
    .trim();
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
async function loadActiveDoc(sessionId, currentDocId, log) {
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

  // Backfill OCR for any page that predates the OCR feature. The job is
  // idempotent so a no-op when the row already exists.
  for (const p of pages) {
    ensureImageOcr({ imageId: p.id, storageUrl: p.storageUrl, log }).catch((err) => {
      log?.warn({ err: err?.message, imageId: p.id }, 'ensureImageOcr background job rejected');
    });
  }

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
    // the active page. Not persisted — Brain's `lookup_on_image` for that
    // imageId substitutes these bytes for the original photo so Eyes can
    // see what the student circled. Absent when the canvas is clean.
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

    const activeDoc = await loadActiveDoc(sessionId, session.currentDocId, request.log);

    // Build the per-imageId annotated-bytes map for this turn. Only honor an
    // annotated image whose imageId belongs to a page of the active doc —
    // a stale imageId from a switched-out doc gets dropped, not trusted.
    //
    // We store the raw Buffer + mimeType + a bytes hash, not the original
    // base64 dataUrl. Two reasons: (1) the dataUrl JS string is ~33% bigger
    // than the Buffer and lives in memory for the whole multi-round Brain
    // turn, (2) downstream vision calls used to re-hash the entire base64
    // payload as the cache key, allocating another copy of the string just
    // to feed to sha256. Hashing the bytes directly is equivalent and
    // cheaper, and the dataUrl is encoded lazily inside lookupOnImage only
    // when there's a cache miss.
    const annotatedByImageId = new Map();
    if (annotatedImage && activeDoc) {
      const pageMatch = activeDoc.pages.find((p) => p.id === annotatedImage.imageId);
      if (pageMatch) {
        const decoded = decodeImageDataUrl(annotatedImage.dataUrl);
        if (decoded) {
          annotatedByImageId.set(pageMatch.id, {
            bytes: decoded.bytes,
            mimeType: decoded.mimeType,
            bytesHash: createHash('sha256').update(decoded.bytes).digest('hex')
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
      { role: 'user', content }
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

    // Collects { usage, model, modelVersion, imageId } for each Eyes
    // (lookup_on_image) call this turn so we can write a billing row per
    // call and roll the cost into the assistant message.
    const visionUsageCollector = [];

    const dispatchTool = makeTutorTools({
      activeDoc,
      viewingPage,
      log: request.log,
      emit: sse,
      usedColorsForTurn,
      signal: abortController.signal,
      annotatedByImageId,
      visionUsageCollector
    });

    const {
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

    // Hallucination check: Brain sometimes writes "I've highlighted X in
    // yellow…" without actually calling draw_annotation. The persona forbids
    // this but DeepSeek occasionally pattern-matches off prior assistant
    // turns. Log it so we can measure how often, and consider a retry loop
    // if it stays frequent.
    const drewSomething = allToolCalls.some((c) => c.name === 'draw_annotation');
    if (!drewSomething && looksLikeAnnotationAnnouncement(assistantContent)) {
      request.log.warn(
        { sessionId, contentPreview: assistantContent.slice(0, 200) },
        'Brain narrated a highlight without calling draw_annotation — annotation hallucinated'
      );
    }

    // Roll Brain rounds + Eyes calls into one bill for this assistant
    // message. The audit-table inserts happen after the row is created so
    // every llm_usage record has the right messageId FK.
    const brainNormalised = (usageRecords ?? []).map((r) => normaliseUsage(r.usage));
    const visionNormalised = visionUsageCollector.map((r) => normaliseUsage(r.usage));
    const turnTotals = sumUsage([...brainNormalised, ...visionNormalised]);

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

      // Best-effort audit log. One row per actual upstream call — Brain
      // rounds + Eyes lookups that hit the network. Cache hits aren't
      // recorded because they didn't cost anything. Batched into a single
      // INSERT so a turn with N Eyes lookups is one DB round-trip, not N+1.
      const auditRecords = [
        ...(usageRecords ?? []).map((rec) => ({
          userId,
          sessionId,
          messageId: assistantRow.id,
          purpose: 'brain_chat',
          model: modelId,
          modelVersion: rec.modelVersion,
          usage: rec.usage
        })),
        ...visionUsageCollector.map((rec) => ({
          userId,
          sessionId,
          messageId: assistantRow.id,
          imageId: rec.imageId,
          purpose: 'vision_lookup',
          model: rec.model,
          modelVersion: rec.modelVersion,
          usage: rec.usage
        }))
      ];
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
