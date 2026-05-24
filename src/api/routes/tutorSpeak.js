import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import { ttsAudio, tutorSession } from '../db/schema.js';
import persistAudio from '../lib/persistAudio.js';
import synthesizeSpeech from '../lib/synthesizeSpeech.js';

const DEFAULT_MODEL = 'kokoro';
const DEFAULT_VOICE = 'af_heart';
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

    const abortController = new AbortController();
    request.raw.on('close', () => abortController.abort());

    // Single transaction wraps session check → cache lookup → (on miss)
    // synthesis + persist + insert. Synthesis holds the connection during
    // the HTTP round-trip; acceptable because sentence audio is small and
    // the cache hit-rate is high.
    let result;
    try {
      result = await withTx(async (tx) => {
        const [session] = await tx
          .select({ id: tutorSession.id })
          .from(tutorSession)
          .where(and(eq(tutorSession.id, sessionId), eq(tutorSession.userId, request.userId)));
        if (!session) return { kind: 'notFound' };

        const [cached] = await tx
          .select({ storageUrl: ttsAudio.storageUrl, bytes: ttsAudio.bytes })
          .from(ttsAudio)
          .where(
            and(
              eq(ttsAudio.textHash, textHash),
              eq(ttsAudio.voice, voice),
              eq(ttsAudio.model, model)
            )
          );

        if (cached && cached.storageUrl.startsWith('file://')) {
          return { kind: 'cached', cached };
        }

        const synth = await synthesizeSpeech({
          text,
          baseUrl,
          apiKey,
          model,
          voice,
          signal: abortController.signal
        });

        const { storageUrl } = await persistAudio({ bytes: synth.bytes, contentHash: textHash });
        await tx
          .insert(ttsAudio)
          .values({
            textHash,
            voice,
            model,
            storageUrl,
            bytes: synth.bytes.length
          })
          .onConflictDoNothing();

        return { kind: 'fresh', synth };
      });
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
      reply
        .header('Content-Type', 'audio/mpeg')
        .header('Cache-Control', 'private, max-age=86400')
        .header('Content-Length', String(cached.bytes));
      return reply.send(createReadStream(fileURLToPath(cached.storageUrl)));
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
