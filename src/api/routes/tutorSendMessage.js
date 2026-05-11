import { and, asc, eq, isNull } from 'drizzle-orm';
import db from '../db/index.js';
import {
  sessionImage,
  sessionMessage,
  tutorSession,
  visionExtraction
} from '../db/schema.js';
import agentChat from '../lib/agentChat.js';
import drawingTools from '../lib/drawingTools.js';
import extractVision from '../lib/extractVision.js';
import hashBuffer from '../lib/hashBuffer.js';
import persistImage from '../lib/persistImage.js';
import tutorPrompt from '../lib/tutorPrompt.js';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

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

async function resolveImage({ sessionId, imageDataUrl, log }) {
  if (!imageDataUrl) return null;
  const decoded = decodeDataUrl(imageDataUrl);
  if (!decoded) {
    log.warn({ sessionId }, 'image dataUrl could not be decoded — ignoring');
    return null;
  }
  const contentHash = hashBuffer(decoded.bytes);
  const [existing] = await db()
    .select({ id: sessionImage.id, width: sessionImage.width, height: sessionImage.height })
    .from(sessionImage)
    .where(and(eq(sessionImage.sessionId, sessionId), eq(sessionImage.contentHash, contentHash)));
  if (existing) {
    return { id: existing.id, contentHash, wasCached: true };
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
      // We don't decode dimensions server-side; use 0 as a sentinel. The
      // frontend already passes width/height for the canvas; we could plumb
      // it through later if needed.
      width: 0,
      height: 0
    })
    .returning({ id: sessionImage.id });
  return { id: inserted.id, contentHash, wasCached: false };
}

async function loadOrRunVision({ image, imageDataUrl, log }) {
  if (!image) return null;
  const [existing] = await db()
    .select({ extracted: visionExtraction.extracted })
    .from(visionExtraction)
    .where(and(eq(visionExtraction.imageId, image.id), isNull(visionExtraction.regionHash)));
  if (existing) {
    log.info({ imageId: image.id }, 'vision_extraction cache hit');
    return existing.extracted;
  }
  if (!imageDataUrl) {
    log.warn({ imageId: image.id }, 'image cached but no extraction and no dataUrl to re-extract');
    return null;
  }
  const { baseUrl, apiKey, model } = visionConfig();
  log.info({ imageId: image.id, model }, 'running Eyes (vision extraction)');
  const { extracted, modelVersion } = await extractVision({
    imageDataUrl,
    baseUrl,
    apiKey,
    model
  });
  await db()
    .insert(visionExtraction)
    .values({
      imageId: image.id,
      regionHash: null,
      extracted,
      modelVersion
    });
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

    // Resolve the active image: either the one in this request, or the
    // session's current_image_id from a prior turn.
    let activeImage = null;
    if (imageDataUrl) {
      activeImage = await resolveImage({ sessionId, imageDataUrl, log: request.log });
      if (activeImage && activeImage.id !== session.currentImageId) {
        await db()
          .update(tutorSession)
          .set({ currentImageId: activeImage.id, updatedAt: new Date() })
          .where(eq(tutorSession.id, sessionId));
      }
    } else if (session.currentImageId) {
      activeImage = { id: session.currentImageId, wasCached: true };
    }

    let visionJson = null;
    try {
      visionJson = await loadOrRunVision({
        image: activeImage,
        imageDataUrl,
        log: request.log
      });
    } catch (err) {
      request.log.error({ err, sessionId }, 'Eyes extraction failed — continuing without vision JSON');
    }

    const history = await db()
      .select({ role: sessionMessage.role, content: sessionMessage.content })
      .from(sessionMessage)
      .where(eq(sessionMessage.sessionId, sessionId))
      .orderBy(asc(sessionMessage.createdAt));

    const [userRow] = await db()
      .insert(sessionMessage)
      .values({
        sessionId,
        role: 'user',
        content,
        imageId: activeImage?.id ?? null
      })
      .returning({ id: sessionMessage.id, createdAt: sessionMessage.createdAt });

    const modelMessages = [
      { role: 'system', content: tutorPrompt() },
      ...(visionJson
        ? [
            {
              role: 'system',
              content: `Worksheet contents (JSON):\n${JSON.stringify(visionJson)}`
            }
          ]
        : []),
      ...history.map((m) => ({ role: m.role, content: m.content })),
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
      createdAt: userRow.createdAt
    });

    if (visionJson) {
      sse('meta', { kind: 'vision_ready', imageId: activeImage?.id ?? null });
    }

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
    const toolCallAccum = new Map();
    const completedToolCalls = [];

    function flushCompletedToolCalls() {
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
        const call = { id: acc.id, name: acc.name, args };
        completedToolCalls.push(call);
        request.log.info({ sessionId, call }, 'Emitted tool call');
        sse('tool', call);
      }
      toolCallAccum.clear();
    }

    try {
      for await (const chunk of agentChat({
        baseUrl,
        apiKey,
        model: modelId,
        messages: modelMessages,
        tools: visionJson ? drawingTools : undefined,
        signal: abortController.signal
      })) {
        if (chunk.delta) {
          assistantContent += chunk.delta;
          sse('token', { delta: chunk.delta });
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
        if (chunk.finishReason) {
          if (chunk.finishReason === 'tool_calls' || chunk.finishReason === 'stop') {
            flushCompletedToolCalls();
          }
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
          completionTokens = chunk.usage.completion_tokens ?? completionTokens;
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        interrupted = true;
      } else {
        fatalError = err;
        request.log.error({ err, sessionId }, 'Chat stream failed');
      }
    } finally {
      flushCompletedToolCalls();
    }

    try {
      const [assistantRow] = await db()
        .insert(sessionMessage)
        .values({
          sessionId,
          role: 'assistant',
          content: assistantContent,
          modelId,
          imageId: activeImage?.id ?? null,
          promptTokens,
          completionTokens,
          interrupted,
          toolCalls: completedToolCalls.length > 0 ? completedToolCalls : null
        })
        .returning({ id: sessionMessage.id, createdAt: sessionMessage.createdAt });

      if (fatalError) {
        sse('error', {
          error: fatalError.message?.slice(0, 600) || 'The tutor lost its train of thought. Try again?'
        });
      } else {
        sse('done', {
          messageId: assistantRow.id,
          promptTokens,
          completionTokens,
          interrupted,
          toolCalls: completedToolCalls.length > 0 ? completedToolCalls : [],
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
