import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionImage, sessionMessage, tutorSession } from '../db/schema.js';
import brainTools from '../lib/brainTools.js';
import ensureImageOcr from '../lib/ensureImageOcr.js';
import hashBuffer from '../lib/hashBuffer.js';
import makeTutorTools from '../lib/makeTutorTools.js';
import persistImage from '../lib/persistImage.js';
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

function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], bytes: Buffer.from(match[2], 'base64') };
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

async function resolveImage({ sessionId, imageDataUrl, dimensions, log }) {
  if (!imageDataUrl) return null;
  const decoded = decodeDataUrl(imageDataUrl);
  if (!decoded) {
    log.warn({ sessionId }, 'image dataUrl could not be decoded — ignoring');
    return null;
  }
  const contentHash = hashBuffer(decoded.bytes);
  const [existing] = await db()
    .select({
      id: sessionImage.id,
      width: sessionImage.width,
      height: sessionImage.height,
      storageUrl: sessionImage.storageUrl
    })
    .from(sessionImage)
    .where(and(eq(sessionImage.sessionId, sessionId), eq(sessionImage.contentHash, contentHash)));
  if (existing) {
    log.info(
      { sessionId, contentHash: contentHash.slice(0, 12), imageId: existing.id },
      'resolveImage: hash matched existing session_image'
    );
    return {
      id: existing.id,
      storageUrl: existing.storageUrl,
      width: existing.width || dimensions?.width || 0,
      height: existing.height || dimensions?.height || 0
    };
  }
  const { storageUrl } = await persistImage({
    bytes: decoded.bytes,
    contentHash,
    mimeType: decoded.mimeType
  });
  const [inserted] = await db()
    .insert(sessionImage)
    .values({
      sessionId,
      contentHash,
      storageUrl,
      width: Math.max(0, Math.round(dimensions?.width || 0)),
      height: Math.max(0, Math.round(dimensions?.height || 0))
    })
    .returning({ id: sessionImage.id });
  log.info(
    {
      sessionId,
      contentHash: contentHash.slice(0, 12),
      imageId: inserted.id,
      width: dimensions?.width || 0,
      height: dimensions?.height || 0
    },
    'resolveImage: inserted new session_image'
  );
  // Kick OCR async. The promise is tracked inside ensureImageOcr so the
  // find_text_on_image handler can await it later in the same turn.
  ensureImageOcr({ imageId: inserted.id, storageUrl, log }).catch(() => {});
  return {
    id: inserted.id,
    storageUrl,
    width: dimensions?.width || 0,
    height: dimensions?.height || 0
  };
}

export default function tutorSendMessage(fastify) {
  fastify.post('/api/tutor/:sessionId/message', async (request, reply) => {
    const { sessionId } = request.params;
    const content = typeof request.body?.content === 'string' ? request.body.content.trim() : '';
    const imageDataUrl =
      typeof request.body?.image?.dataUrl === 'string' && request.body.image.dataUrl.startsWith('data:image/')
        ? request.body.image.dataUrl
        : null;

    if (!content) {
      reply.code(400);
      return { error: 'content is required' };
    }

    const [session] = await db()
      .select({
        id: tutorSession.id,
        currentImageId: tutorSession.currentImageId,
        guidanceLevel: tutorSession.guidanceLevel
      })
      .from(tutorSession)
      .where(eq(tutorSession.id, sessionId));

    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const reqImageDims = {
      width: Number(request.body?.image?.width) || 0,
      height: Number(request.body?.image?.height) || 0
    };

    request.log.info(
      {
        sessionId,
        hasImageInRequest: !!imageDataUrl,
        sessionCurrentImageId: session.currentImageId,
        imageDims: reqImageDims
      },
      'turn start'
    );

    let activeImage = null;
    // True only when *this* turn introduces an image the session hasn't seen
    // before. Drives whether we persist a standalone image-only user message
    // so the UI can render the photo as its own bubble exactly once.
    let imageChangedThisTurn = false;
    if (imageDataUrl) {
      activeImage = await resolveImage({
        sessionId,
        imageDataUrl,
        dimensions: reqImageDims,
        log: request.log
      });
      if (activeImage && activeImage.id !== session.currentImageId) {
        imageChangedThisTurn = true;
        await db()
          .update(tutorSession)
          .set({ currentImageId: activeImage.id, updatedAt: new Date() })
          .where(eq(tutorSession.id, sessionId));
      }
    } else if (session.currentImageId) {
      const [row] = await db()
        .select({
          id: sessionImage.id,
          width: sessionImage.width,
          height: sessionImage.height,
          storageUrl: sessionImage.storageUrl
        })
        .from(sessionImage)
        .where(eq(sessionImage.id, session.currentImageId));
      if (row) {
        activeImage = {
          id: row.id,
          storageUrl: row.storageUrl,
          width: row.width,
          height: row.height
        };
        // Backfill OCR for images that predate this feature. ensureImageOcr
        // is idempotent — a row that already exists is a no-op.
        ensureImageOcr({ imageId: row.id, storageUrl: row.storageUrl, log: request.log }).catch(
          () => {}
        );
      }
    }

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

    // When the user attaches a new image, persist it as its own user message
    // (no text) so the transcript shows the photo as a standalone bubble
    // exactly once. The text turn itself stores no imageId — Brain still sees
    // the page through lookup_on_image against session.currentImageId.
    let imageMessageRow = null;
    if (imageChangedThisTurn && activeImage) {
      const [row] = await db()
        .insert(sessionMessage)
        .values({
          sessionId,
          role: 'user',
          content: '',
          imageId: activeImage.id
        })
        .returning({ id: sessionMessage.id, createdAt: sessionMessage.createdAt });
      imageMessageRow = row;
    }

    const [userRow] = await db()
      .insert(sessionMessage)
      .values({
        sessionId,
        role: 'user',
        content,
        imageId: null
      })
      .returning({ id: sessionMessage.id, createdAt: sessionMessage.createdAt });

    const modelMessages = [
      ...tutorPrompt({
        hasImage: !!activeImage,
        usedColors,
        guidanceLevel: session.guidanceLevel
      }),
      // Skip empty-content rows: those are image-attachment markers for the
      // UI, not anything Brain needs in its conversational context. For
      // prior assistant turns, strip phantom-highlight narration that wasn't
      // backed by a real draw_annotation call — otherwise the lie compounds
      // across turns as Brain treats its own past hallucinations as a template.
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
      createdAt: userRow.createdAt,
      imageMessage: imageMessageRow
        ? {
            id: imageMessageRow.id,
            imageId: activeImage.id,
            createdAt: imageMessageRow.createdAt
          }
        : null
    });

    const abortController = new AbortController();
    request.raw.on('close', () => {
      clientClosed = true;
      abortController.abort();
    });

    const dispatchTool = makeTutorTools({
      activeImage,
      imageDataUrl,
      log: request.log,
      emit: sse,
      usedColorsForTurn,
      signal: abortController.signal
    });

    const {
      assistantContent,
      allToolCalls,
      promptTokens,
      completionTokens,
      interrupted,
      error: turnError
    } = await runBrainTurn({
      baseUrl,
      apiKey,
      model: modelId,
      messages: modelMessages,
      tools: activeImage ? brainTools : undefined,
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

    try {
      const [assistantRow] = await db()
        .insert(sessionMessage)
        .values({
          sessionId,
          role: 'assistant',
          content: assistantContent,
          modelId,
          imageId: null,
          promptTokens,
          completionTokens,
          interrupted,
          toolCalls: allToolCalls.length > 0 ? allToolCalls : null
        })
        .returning({ id: sessionMessage.id, createdAt: sessionMessage.createdAt });

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
          promptTokens,
          completionTokens,
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
