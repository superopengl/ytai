import { asc, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { sessionMessage, tutorSession } from '../db/schema.js';
import openaiChat from '../lib/openaiChat.js';
import tutorPrompt from '../lib/tutorPrompt.js';
import drawingTools from '../lib/drawingTools.js';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

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
      .select({ id: tutorSession.id })
      .from(tutorSession)
      .where(eq(tutorSession.id, sessionId));

    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const history = await db()
      .select({ role: sessionMessage.role, content: sessionMessage.content })
      .from(sessionMessage)
      .where(eq(sessionMessage.sessionId, sessionId))
      .orderBy(asc(sessionMessage.createdAt));

    const [userRow] = await db()
      .insert(sessionMessage)
      .values({ sessionId, role: 'user', content })
      .returning({ id: sessionMessage.id, createdAt: sessionMessage.createdAt });

    const modelMessages = [
      { role: 'system', content: tutorPrompt() },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      imageDataUrl
        ? {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageDataUrl } },
              { type: 'text', text: content }
            ]
          }
        : { role: 'user', content }
    ];

    const modelId = imageDataUrl
      ? process.env.YTAI_OPENROUTER_VISION_MODEL || 'qwen/qwen2.5-vl-72b-instruct'
      : process.env.YTAI_OPENROUTER_CHAT_MODEL || 'deepseek/deepseek-chat';

    const baseUrl = imageDataUrl
      ? process.env.YTAI_VISION_BASE_URL ||
        process.env.YTAI_OPENROUTER_BASE_URL ||
        DEFAULT_BASE_URL
      : process.env.YTAI_OPENROUTER_BASE_URL || DEFAULT_BASE_URL;

    const apiKey = imageDataUrl
      ? process.env.YTAI_VISION_API_KEY || process.env.YTAI_OPENROUTER_API_KEY || ''
      : process.env.YTAI_OPENROUTER_API_KEY || '';

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
        if (!acc.name) continue;
        let args = {};
        if (acc.argsRaw) {
          try {
            args = JSON.parse(acc.argsRaw);
          } catch {
            continue;
          }
        }
        const call = { id: acc.id, name: acc.name, args };
        completedToolCalls.push(call);
        sse('tool', call);
      }
      toolCallAccum.clear();
    }

    try {
      for await (const chunk of openaiChat({
        baseUrl,
        apiKey,
        model: modelId,
        messages: modelMessages,
        tools: imageDataUrl ? drawingTools : undefined,
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
        if (chunk.finishReason === 'tool_calls' || chunk.finishReason === 'stop') {
          flushCompletedToolCalls();
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
          completionTokens = chunk.usage.completion_tokens ?? completionTokens;
        }
      }
      flushCompletedToolCalls();
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
