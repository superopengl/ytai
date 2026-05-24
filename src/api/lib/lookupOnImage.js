import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import db from '../db/index.js';
import { visionExtraction } from '../db/schema.js';
import askVisionModel from './askVisionModel.js';
import loadImageDataUrl from './loadImageDataUrl.js';

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

function bytesSignatureFromDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return '';
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return '';
  // Hash only the base64 payload — the data URL prefix is constant per
  // mime and the payload alone identifies the bytes.
  return createHash('sha256').update(dataUrl.slice(commaIdx + 1)).digest('hex');
}

// Hashed natural-language vision Q&A cache. Brain often asks the same thing
// twice during a session (e.g. "list the questions") — caching makes the
// second-and-onwards calls free. Keyed by (imageId, hashedQuestion); when
// `imageDataUrlOverride` is passed (student-drawn freehand on the canvas),
// the question hash is dusted with the override's bytes hash so each
// distinct annotation state caches independently and stale answers from a
// past, un-annotated turn don't leak through.
export default async function lookupOnImage({
  image,
  question,
  log,
  signal,
  imageDataUrlOverride = null
}) {
  const bytesSignature = imageDataUrlOverride ? bytesSignatureFromDataUrl(imageDataUrlOverride) : '';
  const questionHash = hashQuestion(question, bytesSignature);
  const [cached] = await db()
    .select({ extracted: visionExtraction.extracted })
    .from(visionExtraction)
    .where(and(eq(visionExtraction.imageId, image.id), eq(visionExtraction.regionHash, questionHash)));
  if (cached?.extracted) {
    log?.info(
      { imageId: image.id, questionHash: questionHash.slice(0, 12), annotated: !!imageDataUrlOverride },
      'vision cache hit'
    );
    return cached.extracted;
  }

  const imageDataUrl = imageDataUrlOverride || (await loadImageDataUrl(image.storageUrl));
  if (!imageDataUrl) {
    log?.warn({ imageId: image.id }, 'cannot run vision: no data URL and storage unreadable');
    return { answer: '', bbox: null, error: 'image-unavailable' };
  }

  const { baseUrl, apiKey, model } = visionConfig();
  log?.info(
    { imageId: image.id, question, model, annotated: !!imageDataUrlOverride },
    'running Eyes (lookup_on_image)'
  );
  const { answer, modelVersion } = await askVisionModel({
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
