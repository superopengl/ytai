import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { jsonrepair } from 'jsonrepair';
import db from '../db/index.js';
import {
  sessionImage,
  sessionMessage,
  tutorSession,
  visionExtraction
} from '../db/schema.js';
import agentChat from '../lib/agentChat.js';
import { resolveAnnotationColor, ANNOTATION_COLOR_NAMES } from '../lib/annotationPalette.js';
import askVision from '../lib/askVision.js';
import brainTools from '../lib/brainTools.js';
import ensureImageOcr from '../lib/ensureImageOcr.js';
import findTextOnImage from '../lib/findTextOnImage.js';
import hashBuffer from '../lib/hashBuffer.js';
import loadImageDataUrl from '../lib/loadImageDataUrl.js';
import persistImage from '../lib/persistImage.js';
import snapAnnotationBbox from '../lib/snapAnnotationBbox.js';
import tutorPrompt from '../lib/tutorPrompt.js';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// Safety cap: Brain can chain lookups, but if it keeps calling tools without
// emitting content something is wrong — bail before we melt the OpenRouter bill.
// 10 is comfortable for the "list page → find text → draw → read q → grade
// student answer → respond" chain; 6 was too tight when both subjects
// (the question and the student's answer) needed their own lookup.
const MAX_TOOL_ROUNDS = 10;
// After this many consecutive rounds where Brain made tool calls but emitted
// no new text, treat it as a tool-spam loop (typically hunting for an OCR
// bbox that doesn't exist) and drop the tools on the next round so Brain
// must answer in plain text. Counts CONSECUTIVE silent rounds, so a lead-in
// like "Let me look that up." resets the counter — only the runaway pattern
// fires. 3 is tight enough to catch obvious spam without false-positives on
// a legitimate "lookup → find → draw" chain (each step typically has at
// least a few words of accompanying narration).
const TOOL_SPAM_THRESHOLD = 3;

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
// feeding it back to Brain. If an earlier turn narrated a highlight
// without actually calling draw_annotation, leaving that sentence in the
// model's conversation history teaches it the lie is a valid pattern —
// next turn it copies the form. Returns the cleaned content (which may
// be empty if the entire message was the false claim).
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

function visionConfig() {
  return {
    baseUrl:
      process.env.YTAI_VISION_BASE_URL ||
      process.env.YTAI_OPENROUTER_BASE_URL ||
      DEFAULT_OPENROUTER_BASE_URL,
    apiKey: process.env.YTAI_VISION_API_KEY || process.env.YTAI_OPENROUTER_API_KEY || '',
    model: process.env.YTAI_OPENROUTER_VISION_MODEL || 'qwen/qwen2.5-vl-7b-instruct'
  };
}

function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], bytes: Buffer.from(match[2], 'base64') };
}

function hashQuestion(question) {
  return createHash('sha256').update(question.trim().toLowerCase()).digest('hex');
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

// Hashed natural-language vision Q&A cache. Brain often asks the same thing
// twice during a session (e.g. "list the questions") — caching makes the
// second-and-onwards calls free. Keyed by (imageId, hashedQuestion); when
// annotations change the imageId changes too, so cached answers correctly
// expire.
async function lookupOnImage({ image, question, imageDataUrlForThisTurn, log, signal }) {
  const questionHash = hashQuestion(question);
  const [cached] = await db()
    .select({ extracted: visionExtraction.extracted })
    .from(visionExtraction)
    .where(and(eq(visionExtraction.imageId, image.id), eq(visionExtraction.regionHash, questionHash)));
  if (cached?.extracted) {
    log.info({ imageId: image.id, questionHash: questionHash.slice(0, 12) }, 'vision cache hit');
    return cached.extracted;
  }

  const imageDataUrl = imageDataUrlForThisTurn || (await loadImageDataUrl(image.storageUrl));
  if (!imageDataUrl) {
    log.warn({ imageId: image.id }, 'cannot run vision: no data URL and storage unreadable');
    return { answer: '', bbox: null, error: 'image-unavailable' };
  }

  const { baseUrl, apiKey, model } = visionConfig();
  log.info({ imageId: image.id, question, model }, 'running Eyes (lookup_on_image)');
  const { answer, modelVersion } = await askVision({
    imageDataUrl,
    question,
    baseUrl,
    apiKey,
    model,
    signal
  });

  const extracted = { question, answer };
  await db()
    .insert(visionExtraction)
    .values({
      imageId: image.id,
      regionHash: questionHash,
      extracted,
      modelVersion
    })
    .onConflictDoNothing();
  log.info(
    {
      imageId: image.id,
      questionHash: questionHash.slice(0, 12),
      answerPreview: answer.slice(0, 200)
    },
    'Eyes lookup complete'
  );
  return extracted;
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

    // Colors Brain has already used for draw_annotation this session. We
    // feed these back to it via the system prompt so it can pick a fresh
    // palette entry on the next mark.
    const usedColors = collectUsedColors(history);
    const usedColorsForTurn = new Set(usedColors);

    // When the user attaches a new image, persist it as its own user message
    // (no text) so the transcript shows the photo as a standalone bubble
    // exactly once. The text turn itself stores no imageId — Brain still
    // sees the page through lookup_on_image against session.currentImageId.
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
      // Skip empty-content rows: those are image-attachment markers for the UI,
      // not anything Brain needs in its conversational context. For prior
      // assistant turns, strip any phantom-highlight narration that wasn't
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

    let assistantContent = '';
    let promptTokens = null;
    let completionTokens = null;
    let interrupted = false;
    let fatalError = null;
    // Every tool call this turn, with the result Brain saw. Persisted to
    // session_message.tool_calls so a cap-hit can be debugged from the DB
    // (the lookup chain is otherwise only in the live pino-pretty log).
    // The UI ignores any entry whose name isn't 'draw_annotation' — see
    // ChatPanel.jsx history restore.
    const allToolCalls = [];

    let hitRoundCap = false;
    // True once we've already injected the "please answer now" reminder for
    // an empty-stop turn this request, so we don't loop on it forever.
    let emptyStopRecovery = false;
    // Sticky: once we've decided Brain is in a tool-spam loop, keep tools off
    // for the rest of the turn so it can't relapse into the same chain.
    let forceTextOnly = false;
    // Consecutive rounds where Brain made tool calls but emitted no text.
    // Reset whenever Brain says anything; threshold trips forceTextOnly. We
    // can't use `assistantContent.length === 0` — a single lead-in sentence
    // like "Let me check what question 4 says." would prevent the safety net
    // from ever firing.
    let consecutiveSilentToolRounds = 0;
    try {
      let round = 0;
      for (; round < MAX_TOOL_ROUNDS; round += 1) {
        // Detect tool-spam loops: Brain has used several tool-call rounds in
        // a row without saying anything new to the student. The model isn't
        // going to give up on its own (we've tried prompting), so pull tools
        // out from under it and force a plain-text reply with what it has.
        if (
          !forceTextOnly &&
          activeImage &&
          consecutiveSilentToolRounds >= TOOL_SPAM_THRESHOLD
        ) {
          forceTextOnly = true;
          request.log.warn(
            { sessionId, round, consecutiveSilentToolRounds },
            'Brain is in a tool-spam loop with no text — disabling tools and forcing a text reply'
          );
          modelMessages.push({
            role: 'user',
            content:
              "You've called tools several times in a row without writing anything to the " +
              'student. Answer the student now in plain text using what you already learned ' +
              'from earlier tool calls. Do not call any more tools. Skip draw_annotation ' +
              "entirely if you do not have a confirmed bbox — the student's answer matters " +
              'more than a mark on the page.'
          });
        }

        const toolCallAccum = new Map();
        let assistantContentThisRound = '';
        let reasoningThisRound = '';
        let finishReason = null;

        for await (const chunk of agentChat({
          baseUrl,
          apiKey,
          model: modelId,
          messages: modelMessages,
          tools: activeImage && !forceTextOnly ? brainTools : undefined,
          signal: abortController.signal
        })) {
          if (chunk.delta) {
            assistantContentThisRound += chunk.delta;
            assistantContent += chunk.delta;
            sse('token', { delta: chunk.delta });
          }
          if (chunk.reasoning) {
            reasoningThisRound += chunk.reasoning;
          }
          if (chunk.toolCallChunks) {
            for (const tc of chunk.toolCallChunks) {
              const idx = tc.index ?? 0;
              let acc = toolCallAccum.get(idx);
              if (!acc) {
                acc = { id: tc.id || `call_${idx}`, name: '', argsRaw: '' };
                toolCallAccum.set(idx, acc);
              }
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name = tc.function.name;
              if (typeof tc.function?.arguments === 'string') {
                acc.argsRaw += tc.function.arguments;
              }
            }
          }
          if (chunk.finishReason) finishReason = chunk.finishReason;
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
            completionTokens = chunk.usage.completion_tokens ?? completionTokens;
          }
        }

        const pendingCalls = [];
        for (const acc of toolCallAccum.values()) {
          if (!acc.name) {
            request.log.warn(
              { sessionId, accId: acc.id, argsRaw: acc.argsRaw },
              'Tool call accumulator has args but no function name — dropping'
            );
            continue;
          }
          let args = {};
          let parseError = null;
          if (acc.argsRaw) {
            try {
              args = JSON.parse(acc.argsRaw);
            } catch (strictErr) {
              // Brain (deepseek-v4-flash) occasionally streams malformed JSON
              // tool-call arguments — unterminated strings, trailing commas,
              // missing closing braces. Try jsonrepair as a salvage pass
              // before giving up; this recovers most cases without burning
              // an extra Brain round.
              try {
                args = JSON.parse(jsonrepair(acc.argsRaw));
                request.log.warn(
                  { sessionId, name: acc.name, argsRaw: acc.argsRaw, strictErr: strictErr.message },
                  'Tool call arguments needed jsonrepair to parse'
                );
              } catch (repairErr) {
                // Even jsonrepair can't make sense of it. Feed the failure
                // back as a tool result error so the next round can retry.
                // The UI shouldn't see this — it's not actionable for the
                // student.
                request.log.warn(
                  {
                    sessionId,
                    name: acc.name,
                    argsRaw: acc.argsRaw,
                    strictErr: strictErr.message,
                    repairErr: repairErr.message
                  },
                  'Tool call arguments unsalvageable — feeding error back to Brain to retry'
                );
                parseError = strictErr.message;
                args = {};
              }
            }
          }
          pendingCalls.push({ id: acc.id, name: acc.name, args, parseError });
        }

        request.log.info(
          {
            sessionId,
            round,
            finishReason,
            contentChars: assistantContentThisRound.length,
            reasoningChars: reasoningThisRound.length,
            reasoningPreview: reasoningThisRound.slice(0, 400),
            toolCalls: pendingCalls.map((c) => ({ name: c.name, args: c.args }))
          },
          'Brain round complete'
        );

        if (pendingCalls.length === 0) {
          // Brain emitted no tool calls. If it also emitted no text, it
          // produced a degenerate empty turn — leave the student staring at
          // a blank reply. Push one forced "answer the student now" reminder
          // and let the loop iterate once more before giving up. emptyStop
          // guards against doing this twice in a row if Brain still won't
          // respond.
          if (assistantContentThisRound.length === 0 && !emptyStopRecovery) {
            emptyStopRecovery = true;
            request.log.warn(
              { sessionId, round },
              'Brain stopped with no content and no tool calls — injecting forced answer reminder'
            );
            modelMessages.push({
              role: 'user',
              content:
                "You haven't answered yet — please write your reply to the student now in plain " +
                'text. Use what you already learned from earlier tool calls; do not call any more ' +
                'tools. Skip draw_annotation if you do not have a bbox.'
            });
            continue;
          }
          // Plain text turn — done with Brain.
          break;
        }

        // Re-emit the assistant turn as a proper tool_calls message so the
        // next Brain round sees its own prior decision.
        modelMessages.push({
          role: 'assistant',
          content: assistantContentThisRound,
          tool_calls: pendingCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) }
          }))
        });

        for (const call of pendingCalls) {
          let toolResult;
          if (call.parseError) {
            // Streamed arguments didn't parse as JSON. Hand Brain a short
            // explanation and let it re-issue the call on the next round.
            toolResult = {
              error:
                `Your previous ${call.name} tool call had malformed JSON arguments ` +
                `(parser said: ${call.parseError}). Please call ${call.name} again with ` +
                `valid JSON containing every required field.`
            };
          } else if (call.name === 'find_text_on_image') {
            const query = typeof call.args?.query === 'string' ? call.args.query.trim() : '';
            if (!activeImage) {
              toolResult = { error: 'No image is attached to this session.' };
            } else if (!query) {
              toolResult = { status: 'no-match', matches: [], error: 'query is required' };
            } else {
              sse('lookup-start', { id: call.id, question: `find: "${query}"` });
              try {
                toolResult = await findTextOnImage({
                  imageId: activeImage.id,
                  storageUrl: activeImage.storageUrl,
                  query,
                  log: request.log
                });
              } catch (err) {
                request.log.error({ err, sessionId, query }, 'find_text_on_image failed');
                toolResult = {
                  status: 'failed',
                  matches: [],
                  error: `OCR call failed: ${err.message?.slice(0, 200) ?? 'unknown error'}`
                };
              }
            }
            sse('lookup', { id: call.id, question: `find: "${query}"`, result: toolResult });
          } else if (call.name === 'lookup_on_image') {
            const question = typeof call.args?.question === 'string' ? call.args.question.trim() : '';
            if (!activeImage) {
              toolResult = { error: 'No image is attached to this session.' };
            } else if (!question) {
              toolResult = { error: 'lookup_on_image requires a non-empty question.' };
            } else {
              // Tell the UI that Brain has paused to consult Eyes — without
              // this, the chat would freeze with no "Thinking…" indicator
              // for however long the vision call takes.
              sse('lookup-start', { id: call.id, question });
              try {
                toolResult = await lookupOnImage({
                  image: activeImage,
                  question,
                  imageDataUrlForThisTurn: imageDataUrl,
                  log: request.log,
                  signal: abortController.signal
                });
              } catch (err) {
                request.log.error({ err, sessionId, question }, 'lookup_on_image failed');
                toolResult = { error: `Vision call failed: ${err.message?.slice(0, 200) ?? 'unknown error'}` };
              }
            }
            sse('lookup', { id: call.id, question, result: toolResult });
          } else if (call.name === 'draw_annotation') {
            // Reject up front when Brain omitted or mangled the bbox.
            // Without this, the canvas silently drops the annotation
            // (readCornerBbox returns null) and Brain has no feedback to
            // retry — it just burns rounds. The error string nudges Brain
            // toward the specific corner(s) it forgot.
            const cornerKeys = ['x1', 'y1', 'x2', 'y2'];
            const missingCorners = cornerKeys.filter(
              (k) => typeof call.args?.[k] !== 'number' || Number.isNaN(call.args[k])
            );
            if (missingCorners.length > 0) {
              toolResult = {
                error:
                  `draw_annotation requires all four corners (${cornerKeys.join(', ')}). ` +
                  `Missing or non-number: ${missingCorners.join(', ')}. ` +
                  `Resend the full call with every corner — get the bbox from your last lookup result.`
              };
              request.log.warn(
                { sessionId, missing: missingCorners, args: call.args },
                'draw_annotation: missing bbox corners — asking Brain to retry'
              );
            } else if (call.args.x2 <= call.args.x1 || call.args.y2 <= call.args.y1) {
              toolResult = {
                error:
                  `draw_annotation needs x2 > x1 and y2 > y1. Got x1=${call.args.x1}, ` +
                  `y1=${call.args.y1}, x2=${call.args.x2}, y2=${call.args.y2}.`
              };
              request.log.warn(
                { sessionId, args: call.args },
                'draw_annotation: zero-area or inverted bbox — asking Brain to retry'
              );
            } else {
              // Normalize the color: Brain emits a palette name, the canvas
              // expects a hex. Persist both — name for future used-color
              // tracking, hex for rendering. If Brain skipped the field or
              // gave us a duplicate / unknown name, fall back to the first
              // still-unused palette entry so the mark never collides with
              // an earlier one.
              const requestedName =
                typeof call.args?.color === 'string' ? call.args.color.toLowerCase() : null;
              let colorName = requestedName && resolveAnnotationColor(requestedName)
                ? requestedName
                : null;
              if (!colorName || usedColorsForTurn.has(colorName)) {
                colorName =
                  ANNOTATION_COLOR_NAMES.find((c) => !usedColorsForTurn.has(c)) ||
                  colorName ||
                  ANNOTATION_COLOR_NAMES[0];
              }
              usedColorsForTurn.add(colorName);
              call.args = {
                ...call.args,
                color: resolveAnnotationColor(colorName),
                colorName,
                label: typeof call.args?.label === 'string' ? call.args.label.slice(0, 60) : ''
              };

              // Tighten the bbox using OCR before the UI sees it. Brain may
              // have handed us a loose Eyes-style region; the snap shrinks
              // it to hug the actual printed text. No-op when OCR isn't
              // ready, no OCR lines overlap, or the supplied region is too
              // large to be a single-phrase target.
              const supplied = [call.args.x1, call.args.y1, call.args.x2, call.args.y2];
              if (activeImage) {
                try {
                  const snap = await snapAnnotationBbox({
                    imageId: activeImage.id,
                    bbox: supplied,
                    log: request.log
                  });
                  if (snap.snapped) {
                    call.args = {
                      ...call.args,
                      x1: snap.bbox[0],
                      y1: snap.bbox[1],
                      x2: snap.bbox[2],
                      y2: snap.bbox[3]
                    };
                  } else {
                    request.log.info(
                      { sessionId, reason: snap.reason },
                      'draw_annotation: snap skipped — forwarding original bbox'
                    );
                  }
                } catch (err) {
                  request.log.warn(
                    { err: err.message, sessionId },
                    'draw_annotation: snap failed — forwarding original bbox'
                  );
                }
              }
              sse('tool', call);
              toolResult = { ok: true };
            }
          } else {
            request.log.warn({ sessionId, name: call.name }, 'Brain requested unknown tool — ignoring');
            toolResult = { error: `Unknown tool: ${call.name}` };
          }

          allToolCalls.push({
            id: call.id,
            name: call.name,
            args: call.args,
            result: toolResult
          });

          modelMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(toolResult)
          });
        }

        if (finishReason === 'stop') {
          // Provider says it's done but we still have tool calls — feed them
          // back and continue. Otherwise let the loop iterate.
        }

        // Track silent tool rounds for the spam-loop detector. Counts only
        // when Brain made tool calls but emitted zero new text this round.
        // Any text emission (even a one-liner lead-in) resets the counter.
        if (assistantContentThisRound.length > 0) {
          consecutiveSilentToolRounds = 0;
        } else if (pendingCalls.length > 0) {
          consecutiveSilentToolRounds += 1;
        }
      }
      if (round >= MAX_TOOL_ROUNDS) {
        hitRoundCap = true;
        request.log.warn(
          { sessionId, maxRounds: MAX_TOOL_ROUNDS },
          'Brain hit the tool-call round cap without emitting a final answer — aborting'
        );
      }

      // Hallucination check: Brain sometimes writes "I've highlighted X in
      // yellow…" without actually calling draw_annotation. The persona
      // forbids this but DeepSeek occasionally pattern-matches off prior
      // assistant turns. Log it so we can measure how often, and consider
      // a retry loop if it stays frequent.
      const drewSomething = allToolCalls.some((c) => c.name === 'draw_annotation');
      if (!drewSomething && looksLikeAnnotationAnnouncement(assistantContent)) {
        request.log.warn(
          { sessionId, contentPreview: assistantContent.slice(0, 200) },
          'Brain narrated a highlight without calling draw_annotation — annotation hallucinated'
        );
      }
    } catch (err) {
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        interrupted = true;
      } else {
        fatalError = err;
        request.log.error({ err, sessionId }, 'Chat stream failed');
      }
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

      if (fatalError) {
        sse('error', {
          error: fatalError.message?.slice(0, 600) || 'The tutor lost its train of thought. Try again?'
        });
      } else if (!assistantContent && !interrupted) {
        // Catches both the round-cap-hit case and the case where Brain
        // emitted nothing even after forceTextOnly + emptyStopRecovery
        // tried to coax a reply out of it. Either way the student is
        // staring at a blank bubble — give them something useful instead.
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
