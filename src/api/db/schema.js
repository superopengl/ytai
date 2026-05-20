import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

export const ytai = pgSchema('ytai');

export const user = ytai.table(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull().default('pending'),
    // 'local' for name/role-only signups (legacy & dev bootstrap user), 'google'
    // for users who came in through Google Identity Services. Determines which
    // fields are populated below — Google users always have email + googleId.
    authProvider: text('auth_provider').notNull().default('local'),
    email: text('email'),
    googleId: text('google_id'),
    picture: text('picture'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    userEmailUnique: uniqueIndex('user_email_uq').on(t.email),
    userGoogleIdUnique: uniqueIndex('user_google_id_uq').on(t.googleId)
  })
);

export const loginRequest = ytai.table('login_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => user.id),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const tutorSession = ytai.table('tutor_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => user.id),
  // Most recent image attached to the session. Text-only turns reuse its
  // cached vision_extraction so Brain doesn't need the bytes resent.
  currentImageId: uuid('current_image_id'),
  // How Brain paces explanations: 'guided' (Socratic, one tiny step per
  // message), 'balanced' (a couple of sentences then a check-in), or
  // 'direct' (full reasoning in one message). Student-tunable mid-session
  // via the chat-panel control. Default 'direct' so new sessions feel
  // useful without configuration.
  guidanceLevel: text('guidance_level').notNull().default('direct'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const sessionImage = ytai.table(
  'session_image',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull().references(() => tutorSession.id),
    // sha256 of the flattened canvas bytes — same hash within a session
    // returns the existing row so vision_extraction can be reused.
    contentHash: text('content_hash').notNull(),
    storageUrl: text('storage_url').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    sessionHashUnique: uniqueIndex('session_image_session_hash_uq').on(t.sessionId, t.contentHash)
  })
);

// Cheap, deterministic OCR pass on the flattened image bytes. Populated
// asynchronously by the OCR sidecar (EasyOCR — CRAFT detector + CRNN
// recognizer, see devops/ocr/) once per image_id. Brain queries this
// through find_text_on_image to get tight bboxes for printed worksheet
// text — Eyes (vision_extraction) stays the fallback for handwriting,
// math notation, and diagrams.
export const imageOcr = ytai.table('image_ocr', {
  imageId: uuid('image_id')
    .primaryKey()
    .references(() => sessionImage.id),
  // pending | ready | failed
  status: text('status').notNull().default('pending'),
  // Array of { text, confidence, bbox: [x, y, w, h] }, normalized 0..1.
  lines: jsonb('lines'),
  error: text('error'),
  modelVersion: text('model_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const visionExtraction = ytai.table(
  'vision_extraction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    imageId: uuid('image_id').notNull().references(() => sessionImage.id),
    regionHash: text('region_hash'),
    regionBbox: jsonb('region_bbox'),
    extracted: jsonb('extracted').notNull(),
    confidence: numeric('confidence'),
    modelVersion: text('model_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    imageRegionUnique: uniqueIndex('vision_extraction_image_region_uq').on(t.imageId, t.regionHash)
  })
);

export const ttsAudio = ytai.table(
  'tts_audio',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // sha256 of (normalizedText + '\n' + voice + '\n' + model). Same text
    // in the same voice returns the same row across sessions — a kid tutor
    // says "nice work!" or "let's try again" constantly, so cross-session
    // sharing is a real win.
    textHash: text('text_hash').notNull(),
    voice: text('voice').notNull(),
    model: text('model').notNull(),
    storageUrl: text('storage_url').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    ttsAudioHashUnique: uniqueIndex('tts_audio_hash_voice_model_uq').on(t.textHash, t.voice, t.model)
  })
);

export const sessionMessage = ytai.table('session_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => tutorSession.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  imageId: uuid('image_id').references(() => sessionImage.id),
  regionHash: text('region_hash'),
  modelId: text('model_id'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  interrupted: boolean('interrupted').notNull().default(false),
  toolCalls: jsonb('tool_calls'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// Post-session classification report for the parent/teacher view. One row
// per session, lazy-generated on first GET. `questions` holds an array of
// { question, studentAnswer, correctAnswer, correct, mistakeType,
// nswOutcomeCode, nswOutcomeText, stage, subject } objects keyed against
// src/api/data/nswSyllabus.json.
export const sessionReport = ytai.table('session_report', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => tutorSession.id),
  // pending | ready | failed
  status: text('status').notNull().default('pending'),
  summary: text('summary'),
  questions: jsonb('questions'),
  modelVersion: text('model_version'),
  error: text('error'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});
