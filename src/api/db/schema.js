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
    // 'local' for name/role-only signups (legacy & dev bootstrap user), 'google'
    // for users who came in through Google Identity Services, 'email' for
    // OTP-only signups. Determines which fields are populated below — Google
    // users always have email + googleId; email users always have email.
    authProvider: text('auth_provider').notNull().default('local'),
    email: text('email'),
    googleId: text('google_id'),
    picture: text('picture'),
    // Lowercase login handle used by the admin password sign-in path. Only
    // set on accounts that can authenticate with a password (i.e. admins
    // bootstrapped from env vars). Optional everywhere else.
    localLoginUserName: text('local_login_user_name'),
    // scrypt-derived password hash, format: `scrypt$<saltHex>$<keyHex>`.
    // Only set on accounts with `role='admin'` that authenticate via the
    // username/password path. Plain-text passwords are never stored.
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    userEmailUnique: uniqueIndex('user_email_uq').on(t.email),
    userGoogleIdUnique: uniqueIndex('user_google_id_uq').on(t.googleId),
    userLocalLoginUserNameUnique: uniqueIndex('user_local_login_user_name_uq').on(t.localLoginUserName)
  })
);

// Short-lived 6-digit email sign-in codes. Stored in plain text on purpose —
// admins can read codes out to a student whose email isn't reaching them.
// Lifetime is bounded by expiresAt (10 minutes by default); rows are
// opportunistically swept on every new code request, and burned on
// successful verification or after too many wrong attempts.
//
// Unique on `user_id`: each user has at most one live OTP at a time.
// Requesting a fresh code upserts on this constraint, replacing the prior
// code + expiry + attempt counter, so a kid mashing the resend button
// can't accumulate a fan-out of simultaneously-valid codes.
export const loginOtp = ytai.table(
  'login_otp',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => user.id),
    email: text('email').notNull(),
    code: text('code').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    loginOtpUserIdUnique: uniqueIndex('login_otp_user_id_uq').on(t.userId)
  })
);

export const tutorSession = ytai.table('tutor_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => user.id),
  // Most recent doc the student is working on. A doc is a unit of 1..N
  // pages — either a multi-image worksheet or a PDF rasterized into pages.
  // Text-only turns reuse the current doc's cached OCR / vision_extraction
  // so Brain doesn't need bytes resent.
  currentDocId: uuid('current_doc_id'),
  // How Brain paces explanations: 'guided' (Socratic, one tiny step per
  // message), 'balanced' (a couple of sentences then a check-in), or
  // 'direct' (full reasoning in one message). Student-tunable mid-session
  // via the chat-panel control. Default 'direct' so new sessions feel
  // useful without configuration.
  guidanceLevel: text('guidance_level').notNull().default('direct'),
  // Subject the session is anchored to: 'math', 'thinking', 'reading',
  // or 'writing'. Selected by the student on the Tutor page; drives
  // subject-specific prompt scaffolding later.
  subject: text('subject').notNull().default('math'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// A session_doc is the "thing the student is studying right now" — a
// multi-page worksheet (1..N images) or a rasterized PDF. Every
// session_image belongs to exactly one doc, ordered by page_number.
// Brain's tools are scoped to the session's current_doc_id; switching
// docs swaps the canvas and the manifest Brain sees.
export const sessionDoc = ytai.table('session_doc', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => tutorSession.id),
  // 'images' = N pages captured/uploaded as separate images; 'pdf' = pages
  // rasterized from a single source PDF (sourcePdfUrl carries the original).
  kind: text('kind').notNull().default('images'),
  sourcePdfUrl: text('source_pdf_url'),
  pageCount: integer('page_count').notNull().default(0),
  // Position of this doc in the session's doc list (0 = first).
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const sessionImage = ytai.table(
  'session_image',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull().references(() => tutorSession.id),
    // The doc this image is a page of. Every image belongs to exactly one
    // doc; ordering within the doc is page_number (1..N).
    docId: uuid('doc_id').notNull().references(() => sessionDoc.id),
    pageNumber: integer('page_number').notNull().default(1),
    // sha256 of the flattened canvas bytes — same hash within a doc returns
    // the existing row so vision_extraction can be reused. Dedup is per-doc
    // (not per-session) so the same photo can legitimately appear in two
    // different docs without collision.
    contentHash: text('content_hash').notNull(),
    storageUrl: text('storage_url').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    docHashUnique: uniqueIndex('session_image_doc_hash_uq').on(t.docId, t.contentHash),
    docPageUnique: uniqueIndex('session_image_doc_page_uq').on(t.docId, t.pageNumber)
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
    extracted: jsonb('extracted').notNull(),
    // Eyes (vision) identity for the call that populated this row. `model`
    // is what we asked for; `modelVersion` is what the provider returned.
    // Subsequent reads of this row are cache hits — they don't write a new
    // llm_usage record, so these columns are the only record of what the
    // original call cost.
    provider: text('provider'),
    model: text('model'),
    modelVersion: text('model_version').notNull(),
    // Token + cost snapshot for the one upstream call that produced this
    // cached answer. Stays with the row forever — every cache hit on this
    // (imageId, regionHash) avoided this many tokens / this much cost.
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
    costUsd: numeric('cost_usd'),
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
  // Brain's model identity for this turn. `provider` is the platform that
  // served it (openrouter, anthropic, openai, …); `modelId` is the model
  // string we asked for (e.g. "deepseek/deepseek-v4-flash"). The audit
  // log in llm_usage carries one row per upstream call with the same pair.
  provider: text('provider'),
  modelId: text('model_id'),
  // Token + cost rollup for this assistant turn. Sum of the Brain chat call
  // and every Eyes (vision) lookup it triggered — i.e. the full bill for
  // producing this message. The per-call breakdown lives in llm_usage.
  //
  // inputTokens / outputTokens: standard prompt + completion counts.
  // reasoningTokens: subset of outputTokens that the provider attributed
  //   to chain-of-thought (DeepSeek / o1-style models).
  // cacheReadTokens: subset of inputTokens that hit the provider's prompt
  //   cache and was billed at a discount.
  // cacheWriteTokens: tokens the provider wrote into its prompt cache on
  //   this call (Anthropic / DeepSeek). Billed at a small premium.
  // costUsd: what OpenRouter reported as `usage.cost`, summed across calls.
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  reasoningTokens: integer('reasoning_tokens'),
  cacheReadTokens: integer('cache_read_tokens'),
  cacheWriteTokens: integer('cache_write_tokens'),
  costUsd: numeric('cost_usd'),
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
//
// `cursorMessageId` records the last session_message folded into the
// report. Because session_message is append-only and immutable, the
// report is stale iff cursor_message_id < the session's latest message.
// On refresh we either merge the prior questions with new messages
// since the cursor (incremental) or rebuild from scratch (full).
export const sessionReport = ytai.table('session_report', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => tutorSession.id),
  // pending | ready | failed
  status: text('status').notNull().default('pending'),
  summary: text('summary'),
  questions: jsonb('questions'),
  cursorMessageId: uuid('cursor_message_id').references(() => sessionMessage.id),
  cursorMessageAt: timestamp('cursor_message_at', { withTimezone: true }),
  provider: text('provider'),
  modelVersion: text('model_version'),
  error: text('error'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  reasoningTokens: integer('reasoning_tokens'),
  cacheReadTokens: integer('cache_read_tokens'),
  cacheWriteTokens: integer('cache_write_tokens'),
  costUsd: numeric('cost_usd'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// Subject-level report rolled up from this user's session_reports for one
// Every subject_report is a single shape: a free-form analysis driven by
// a user prompt. The frontend offers prompt templates ("Wrong Answer
// Journal", "Strengths & Weaknesses", "Curriculum Map") that prefill the
// prompt textarea, but the backend never distinguishes them — they're
// just prompts.
//
// `includedSessions` snapshots the (sessionId, cursorMessageId) pairs the
// report was built from. Staleness: any included session report has
// moved its cursor, or new sessions for this (user, subject) exist that
// weren't in the snapshot.
export const subjectReport = ytai.table(
  'subject_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => user.id),
    subject: text('subject').notNull(),
    customPrompt: text('custom_prompt'),
    status: text('status').notNull().default('pending'),
    content: jsonb('content'),
    narrative: text('narrative'),
    includedSessions: jsonb('included_sessions'),
    provider: text('provider'),
    modelVersion: text('model_version'),
    // Aggregates the main generation call + the parallel title-generation
    // call. Per-call breakdown lives in llm_usage.
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
    costUsd: numeric('cost_usd'),
    error: text('error'),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  }
);

// Per-call billing audit log. One row per actual upstream LLM API hit
// (cache hits in vision_extraction don't write here — they didn't cost
// anything). Every Brain chat completion, every Eyes vision call, every
// session/subject report generation, and every parallel title call lands
// here. This table is the source of truth for billing and the only place
// that needs to be touched to roll usage up per user or per period — the
// denormalised columns on session_message / session_report / subject_report
// are convenience caches.
//
// `purpose` enumerates the call site: brain_chat | vision_lookup |
// session_report | subject_report | subject_report_title. Most rows carry
// one (and only one) FK pointing back at the entity that triggered the
// call — `messageId` for brain_chat, `imageId` for vision_lookup, etc. —
// so a `WHERE user_id = ? AND created_at >= ?` query reads cleanly.
//
// `usageRaw` snapshots the entire provider `usage` object so any field we
// haven't promoted to a column yet (reasoning tokens, audio tokens, future
// breakdowns) is still recoverable for back-billing.
export const llmUsage = ytai.table('llm_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => user.id),
  sessionId: uuid('session_id').references(() => tutorSession.id),
  messageId: uuid('message_id').references(() => sessionMessage.id),
  imageId: uuid('image_id').references(() => sessionImage.id),
  sessionReportId: uuid('session_report_id').references(() => sessionReport.sessionId),
  subjectReportId: uuid('subject_report_id').references(() => subjectReport.id),
  purpose: text('purpose').notNull(),
  provider: text('provider').notNull().default('openrouter'),
  model: text('model').notNull(),
  modelVersion: text('model_version'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  reasoningTokens: integer('reasoning_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  costUsd: numeric('cost_usd'),
  usageRaw: jsonb('usage_raw'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
