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

function hashQuestion(question) {
  return createHash('sha256').update(question.trim().toLowerCase()).digest('hex');
}

// Hashed natural-language vision Q&A cache. Brain often asks the same thing
// twice during a session (e.g. "list the questions") — caching makes the
// second-and-onwards calls free. Keyed by (imageId, hashedQuestion); when
// annotations change the imageId changes too, so cached answers correctly
// expire.
export default async function lookupOnImage({
  image,
  question,
  log,
  signal
}) {
  const questionHash = hashQuestion(question);
  const [cached] = await db()
    .select({ extracted: visionExtraction.extracted })
    .from(visionExtraction)
    .where(and(eq(visionExtraction.imageId, image.id), eq(visionExtraction.regionHash, questionHash)));
  if (cached?.extracted) {
    log?.info({ imageId: image.id, questionHash: questionHash.slice(0, 12) }, 'vision cache hit');
    return cached.extracted;
  }

  const imageDataUrl = await loadImageDataUrl(image.storageUrl);
  if (!imageDataUrl) {
    log?.warn({ imageId: image.id }, 'cannot run vision: no data URL and storage unreadable');
    return { answer: '', bbox: null, error: 'image-unavailable' };
  }

  const { baseUrl, apiKey, model } = visionConfig();
  log?.info({ imageId: image.id, question, model }, 'running Eyes (lookup_on_image)');
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
