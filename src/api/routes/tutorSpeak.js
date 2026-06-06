import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import db from '../db/index.js';
import { ttsAudio, tutorSession } from '../db/schema.js';
import persistAudio from '../lib/persistAudio.js';
import synthesizeSpeech from '../lib/synthesizeSpeech.js';
import { getObjectStream, objectExists } from '../lib/s3.js';

const DEFAULT_MODEL = 'kokoro';
const DEFAULT_VOICE = 'am_fenrir';
// Sentence-length text only — the frontend splits on sentence boundaries.
// Anything bigger than this is almost certainly the model running away
// without punctuation; reject so we don't pay synthesis cost on a wall.
const MAX_TEXT_CHARS = 1500;

function ttsConfig() {
  return {
    baseUrl: process.env.YTAI_TTS_BASE_URL || '',
    apiKey: process.env.YTAI_TTS_API_KEY || '',
    model: process.env.YTAI_TTS_MODEL || DEFAULT_MODEL,
    defaultVoice: process.env.YTAI_TTS_VOICE || DEFAULT_VOICE
  };
}

function hashKey({ text, voice, model }) {
  return createHash('sha256').update(`${text}\n${voice}\n${model}`).digest('hex');
}

// Speak one sentence. Frontend POSTs { text, voice? }; we return MP3 bytes
// either freshly synthesized or served from the tts_audio cache. The cache
// is shared across sessions — kid-tutor catchphrases ("nice work!",
// "let's try again") repeat constantly, so cross-session hits are common.
export default function tutorSpeak(fastify) {
  fastify.post('/api/tutor/:sessionId/speak', async (request, reply) => {
    const { sessionId } = request.params;
    const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
    const requestedVoice =
      typeof request.body?.voice === 'string' && request.body.voice.trim()
        ? request.body.voice.trim()
        : null;

    if (!text) {
      reply.code(400);
      return { error: 'text is required' };
    }
    if (text.length > MAX_TEXT_CHARS) {
      reply.code(413);
      return { error: `text exceeds ${MAX_TEXT_CHARS} chars` };
    }

    const { baseUrl, apiKey, model, defaultVoice } = ttsConfig();
    if (!baseUrl) {
      reply.code(503);
      return { error: 'TTS is not configured (YTAI_TTS_BASE_URL unset)' };
    }
    const voice = requestedVoice || defaultVoice;
    const textHash = hashKey({ text, voice, model });

    // Abort the upstream TTS fetch only when the client *socket* drops
    // mid-request. `request.raw.on('close', ...)` looked right but isn't:
    // in Node 16+, IncomingMessage emits 'close' as soon as the request
    // stream finishes being consumed (right after Fastify parses the
    // body), so the abort fired on every request and synthesizeSpeech
    // threw AbortError before producing any bytes — Fastify then sent
    // 200 + empty body, which trips the browser's <audio> Range fetch
    // and surfaces as ERR_REQUEST_RANGE_NOT_SATISFIABLE.
    //
    // `reply.raw.on('close')` fires both on clean completion and on
    // premature termination; we gate on `writableEnded` (true iff the
    // response finished cleanly) so only real disconnects abort.
    const abortController = new AbortController();
    reply.raw.on('close', () => {
      if (reply.raw.writableEnded) return;
      abortController.abort();
    });

    // Three discrete DB hits with the slow external IO (synth fetch +
    // persistAudio S3/disk write) sandwiched between them. Wrapping the
    // whole thing in a single `withTx` pinned one Postgres connection per
    // in-flight TTS call (each sentence the frontend speaks!), exhausting
    // the pool under load. Splitting the work means a synth round-trip no
    // longer holds a connection at all.
    let result;
    try {
      const [session] = await db()
        .select({ id: tutorSession.id })
        .from(tutorSession)
        .where(and(eq(tutorSession.id, sessionId), eq(tutorSession.userId, request.userId)));
      if (!session) {
        result = { kind: 'notFound' };
      } else {
        const [cached] = await db()
          .select({ storageUrl: ttsAudio.storageUrl, bytes: ttsAudio.bytes })
          .from(ttsAudio)
          .where(
            and(
              eq(ttsAudio.textHash, textHash),
              eq(ttsAudio.voice, voice),
              eq(ttsAudio.model, model)
            )
          );

        if (cached && (await cacheBytesExist(cached.storageUrl))) {
          result = { kind: 'cached', cached };
        } else {
          const synth = await synthesizeSpeech({
            text,
            baseUrl,
            apiKey,
            model,
            voice,
            signal: abortController.signal
          });

          // Treat an empty synth result as a hard failure — never persist a
          // 0-byte file. Falling through to `reply.send(empty)` here is what
          // produced the silent ERR_REQUEST_RANGE_NOT_SATISFIABLE in the
          // browser <audio> element. Failing fast with 502 makes the
          // frontend toast surface the issue instead.
          if (!synth?.bytes || synth.bytes.length === 0) {
            throw new Error('TTS provider returned 0 bytes');
          }

          const { storageUrl } = await persistAudio({ bytes: synth.bytes, contentHash: textHash });
          await db()
            .insert(ttsAudio)
            .values({
              textHash,
              voice,
              model,
              storageUrl,
              bytes: synth.bytes.length
            })
            .onConflictDoUpdate({
              target: [ttsAudio.textHash, ttsAudio.voice, ttsAudio.model],
              set: {
                storageUrl,
                bytes: synth.bytes.length,
                updatedAt: sql`now()`
              }
            });

          result = { kind: 'fresh', synth };
        }
      }
    } catch (err) {
      if (abortController.signal.aborted) return;
      request.log.error({ err, sessionId, voice, model }, 'TTS synthesis failed');
      reply.code(502);
      return { error: `TTS synthesis failed: ${err.message?.slice(0, 200) ?? 'unknown'}` };
    }

    if (result.kind === 'notFound') {
      reply.code(404);
      return { error: 'Session not found' };
    }

    if (result.kind === 'cached') {
      const { cached } = result;
      request.log.info(
        { sessionId, voice, model, textHash: textHash.slice(0, 12), bytes: cached.bytes },
        'tts cache hit'
      );
      return sendCachedAudio(reply, cached);
    }

    const { synth } = result;
    request.log.info(
      { sessionId, voice, model, textHash: textHash.slice(0, 12), bytes: synth.bytes.length },
      'tts synthesized'
    );
    reply
      .header('Content-Type', synth.contentType)
      .header('Cache-Control', 'private, max-age=86400')
      .header('Content-Length', String(synth.bytes.length));
    return reply.send(synth.bytes);
  });
}

// "Bytes exist" means an object is there AND it carries a usable body.
// A 0-byte file masquerading as a cache hit is a real failure mode: an
// earlier crashed synth left an empty .mp3 on disk, and serving it makes
// the browser's <audio> element issue a Range request the empty body
// can't satisfy (ERR_REQUEST_RANGE_NOT_SATISFIABLE), so the user just
// hears silence. Treating an empty object as a miss forces a re-synth.
async function cacheBytesExist(storageUrl) {
  if (typeof storageUrl !== 'string') return false;
  if (storageUrl.startsWith('file://')) {
    try {
      const stat = statSync(fileURLToPath(storageUrl));
      return stat.isFile() && stat.size > 0;
    } catch {
      return false;
    }
  }
  if (storageUrl.startsWith('s3://')) {
    try {
      return await objectExists(storageUrl);
    } catch {
      return false;
    }
  }
  return false;
}

async function sendCachedAudio(reply, cached) {
  if (cached.storageUrl.startsWith('file://')) {
    // Use the file's *actual* size, not the DB-recorded `cached.bytes`. If
    // an earlier run wrote a stub and crashed before flushing, the row says
    // "24620 bytes" but the file is 0 — sending Content-Length: 24620 with
    // a 0-byte body trips the browser's Range fetch (416). Skip the
    // header entirely when the file's been truncated so the next request
    // re-synthesises.
    const filePath = fileURLToPath(cached.storageUrl);
    let actualSize = 0;
    try {
      actualSize = statSync(filePath).size;
    } catch {
      actualSize = 0;
    }
    if (actualSize === 0) {
      reply.code(502);
      return { error: 'TTS cache file is empty' };
    }
    reply
      .header('Content-Type', 'audio/mpeg')
      .header('Cache-Control', 'private, max-age=86400')
      .header('Content-Length', String(actualSize));
    return reply.send(createReadStream(filePath));
  }

  if (cached.storageUrl.startsWith('s3://')) {
    const obj = await getObjectStream(cached.storageUrl);
    if (!obj) {
      // Lost the race: object disappeared between the existence probe and
      // the GET. Surfacing 502 lets the client retry, which will fall into
      // the synth path on the next attempt.
      reply.code(502);
      return { error: 'TTS cache miss after probe' };
    }
    reply.header('Content-Type', obj.contentType || 'audio/mpeg').header(
      'Cache-Control',
      'private, max-age=86400'
    );
    if (obj.contentLength != null) reply.header('Content-Length', String(obj.contentLength));
    return reply.send(obj.stream);
  }

  reply.code(501);
  return { error: 'Unsupported storage scheme' };
}
