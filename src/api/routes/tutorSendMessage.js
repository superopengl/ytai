import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import db from '../db/index.js';
import {
  sessionImage,
  sessionMessage,
  tutorSession,
  visionExtraction
} from '../db/schema.js';
import agentChat from '../lib/agentChat.js';
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
const MAX_TOOL_ROUNDS = 6;

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
async function lookupOnImage({ image, question, imageDataUrlForThisTurn, log }) {
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
  const { answer, bbox, rawBbox, modelVersion } = await askVision({
    imageDataUrl,
    question,
    baseUrl,
    apiKey,
    model
  });

  const extracted = { question, answer, bbox };
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
      // Native 0–1000 [x1,y1,x2,y2] straight from the VLM, before any
      // padding/scale correction. Useful for spotting whether the model
      // itself is drifting vs. our coord math.
      rawBbox,
      bbox,
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
      .select({ id: tutorSession.id, currentImageId: tutorSession.currentImageId })
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
      .select({ role: sessionMessage.role, content: sessionMessage.content })
      .from(sessionMessage)
      .where(eq(sessionMessage.sessionId, sessionId))
      .orderBy(asc(sessionMessage.createdAt));

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
      ...tutorPrompt({ hasImage: !!activeImage }),
      // Skip empty-content rows: those are image-attachment markers for the UI,
      // not anything Brain needs in its conversational context.
      ...history.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content })),
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
    const visibleToolCalls = []; // draw_annotation calls surfaced to the UI

    let hitRoundCap = false;
    try {
      let round = 0;
      for (; round < MAX_TOOL_ROUNDS; round += 1) {
        const toolCallAccum = new Map();
        let assistantContentThisRound = '';
        let reasoningThisRound = '';
        let finishReason = null;

        for await (const chunk of agentChat({
          baseUrl,
          apiKey,
          model: modelId,
          messages: modelMessages,
          tools: activeImage ? brainTools : undefined,
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
          if (acc.argsRaw) {
            try {
              args = JSON.parse(acc.argsRaw);
            } catch (err) {
              request.log.error(
                { sessionId, name: acc.name, argsRaw: acc.argsRaw, err: err.message },
                'Failed to parse tool call arguments — dropping tool call'
              );
              sse('error', {
                error: `Tool call "${acc.name}" had unparseable arguments and was dropped.`
              });
              continue;
            }
          }
          pendingCalls.push({ id: acc.id, name: acc.name, args });
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
          if (call.name === 'find_text_on_image') {
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
                  log: request.log
                });
              } catch (err) {
                request.log.error({ err, sessionId, question }, 'lookup_on_image failed');
                toolResult = { error: `Vision call failed: ${err.message?.slice(0, 200) ?? 'unknown error'}` };
              }
            }
            sse('lookup', { id: call.id, question, result: toolResult });
          } else if (call.name === 'draw_annotation') {
            // Tighten the bbox using OCR before the UI sees it. Brain may
            // have handed us a loose Eyes-style region; the snap shrinks
            // it to hug the actual printed text. No-op when OCR isn't
            // ready, no OCR lines overlap, or the supplied region is too
            // large to be a single-phrase target. Bbox is corners
            // [x1, y1, x2, y2] end-to-end now.
            const supplied = [call.args?.x1, call.args?.y1, call.args?.x2, call.args?.y2];
            if (activeImage && supplied.every((v) => typeof v === 'number')) {
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
            visibleToolCalls.push(call);
            sse('tool', call);
            toolResult = { ok: true };
          } else {
            request.log.warn({ sessionId, name: call.name }, 'Brain requested unknown tool — ignoring');
            toolResult = { error: `Unknown tool: ${call.name}` };
          }

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
      }
      if (round >= MAX_TOOL_ROUNDS) {
        hitRoundCap = true;
        request.log.warn(
          { sessionId, maxRounds: MAX_TOOL_ROUNDS },
          'Brain hit the tool-call round cap without emitting a final answer — aborting'
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
          toolCalls: visibleToolCalls.length > 0 ? visibleToolCalls : null
        })
        .returning({ id: sessionMessage.id, createdAt: sessionMessage.createdAt });

      if (fatalError) {
        sse('error', {
          error: fatalError.message?.slice(0, 600) || 'The tutor lost its train of thought. Try again?'
        });
      } else if (hitRoundCap && !assistantContent) {
        sse('error', {
          error: 'The tutor kept looking at the page without finishing a thought. Try rephrasing your question.'
        });
      } else {
        sse('done', {
          messageId: assistantRow.id,
          promptTokens,
          completionTokens,
          interrupted,
          toolCalls: visibleToolCalls,
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
