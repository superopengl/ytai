import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { visionExtraction } from '../db/schema.js';
import askVisionModel from './askVisionModel.js';
import loadImageDataUrl from './loadImageDataUrl.js';
import { normaliseUsage } from './recordLlmUsage.js';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

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

function hashQuestion(question, bytesSignature) {
  // Dust the question hash with a bytes signature so two turns with the
  // *same* question but *different* canvas annotations don't collide on
  // the cached row. The original-photo case passes an empty signature so
  // its rows stay where past sessions expect them.
  const seed = bytesSignature ? `${question.trim().toLowerCase()}|bytes:${bytesSignature}` : question.trim().toLowerCase();
  return createHash('sha256').update(seed).digest('hex');
}

// Hashed natural-language vision Q&A cache. Brain often asks the same thing
// twice during a session (e.g. "list the questions") — caching makes the
// second-and-onwards calls free. Keyed by (imageId, hashedQuestion); when
// `annotatedOverride` is passed (student-drawn freehand on the canvas),
// the question hash is dusted with the override's bytes hash so each
// distinct annotation state caches independently and stale answers from a
// past, un-annotated turn don't leak through.
//
// `annotatedOverride` shape: { bytes: Buffer, mimeType: string, bytesHash:
// string }. We accept the raw Buffer rather than a pre-encoded data URL so
// the base64 string is materialized exactly once (inside this function, on
// a cache miss) instead of being held across the entire Brain turn.
//
// Billing: when the caller supplies a `usageCollector` array, every actual
// upstream call (not cache hits — those didn't cost anything) appends
// { usage, model, modelVersion, imageId } so the turn can roll the cost
// into the assistant message after it knows the message id.
export default async function lookupOnImage({
  image,
  question,
  log,
  signal,
  annotatedOverride = null,
  usageCollector = null
}) {
  const bytesSignature = annotatedOverride?.bytesHash || '';
  const questionHash = hashQuestion(question, bytesSignature);
  const [cached] = await db()
    .select({ extracted: visionExtraction.extracted })
    .from(visionExtraction)
    .where(and(eq(visionExtraction.imageId, image.id), eq(visionExtraction.regionHash, questionHash)));
  if (cached?.extracted) {
    log?.info(
      { imageId: image.id, questionHash: questionHash.slice(0, 12), annotated: !!annotatedOverride },
      'vision cache hit'
    );
    return cached.extracted;
  }

  // Encode the data URL only now that we know we're hitting the model.
  // For annotated pages this is the single allocation of the base64 string
  // per turn (vs the previous code path that held it for the whole turn).
  let imageDataUrl;
  if (annotatedOverride) {
    const mime = annotatedOverride.mimeType || 'image/png';
    imageDataUrl = `data:${mime};base64,${annotatedOverride.bytes.toString('base64')}`;
  } else {
    imageDataUrl = await loadImageDataUrl(image.storageUrl);
  }
  if (!imageDataUrl) {
    log?.warn({ imageId: image.id }, 'cannot run vision: no data URL and storage unreadable');
    return { answer: '', bbox: null, error: 'image-unavailable' };
  }

  const { baseUrl, apiKey, model } = visionConfig();
  log?.info(
    { imageId: image.id, question, model, annotated: !!annotatedOverride },
    'running Eyes (lookup_on_image)'
  );
  const { answer, modelVersion, usage } = await askVisionModel({
    imageDataUrl,
    question,
    baseUrl,
    apiKey,
    model,
    signal
  });

  if (Array.isArray(usageCollector)) {
    usageCollector.push({ usage, model, modelVersion, imageId: image.id });
  }

  const extracted = { question, answer };
  // Snapshot what the call cost onto the cache row itself. Every future
  // hit on this (imageId, questionHash) reads the answer back without
  // hitting Eyes again — these columns are the only record of what the
  // first computation cost.
  const normalisedUsage = normaliseUsage(usage);
  await db()
    .insert(visionExtraction)
    .values({
      imageId: image.id,
      regionHash: questionHash,
      extracted,
      provider: 'openrouter',
      model,
      modelVersion,
      inputTokens: normalisedUsage?.inputTokens ?? null,
      outputTokens: normalisedUsage?.outputTokens ?? null,
      reasoningTokens: normalisedUsage?.reasoningTokens ?? null,
      cacheReadTokens: normalisedUsage?.cacheReadTokens ?? null,
      cacheWriteTokens: normalisedUsage?.cacheWriteTokens ?? null,
      costUsd: normalisedUsage?.costUsd ?? null
    })
    .onConflictDoNothing();
  log?.info(
    {
      imageId: image.id,
      questionHash: questionHash.slice(0, 12),
      answerPreview: answer.slice(0, 200)
    },
    'Eyes lookup complete'
  );
  return extracted;
}
