# YouTutorAI Database Schema

PostgreSQL with Drizzle ORM. UUID primary keys, singular table names, automatic `created_at`/`updated_at` timestamps.

Schema defined in `src/api/db/schema.js`, migrations in `src/api/drizzle/`.

## Tables

### `user`
Application users. One row per person. Roles: `student`, `parent`, `teacher`, `admin`. `auth_provider` records how the row got created — `local` (legacy / bootstrapped admins), `google` (one-tap GIS), or `email` (auto-created on first OTP request). Sign-in resolution always tries `google_id` → `email` → `user_name` before inserting.

`user_name` and `password_hash` are only populated on accounts that can authenticate via the username/password path — in practice that's just `role='admin'` users bootstrapped from env vars (or the hardcoded default `admin` / `adminadmin` in dev). Passwords are stored as scrypt-derived hashes (`scrypt$<saltHex>$<keyHex>`); plain text is never persisted.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | display name |
| `role` | text | `student` \| `parent` \| `teacher` \| `admin` |
| `auth_provider` | text | `local` \| `google` \| `email` |
| `email` | text | nullable; unique when present |
| `google_id` | text | Google `sub` claim; nullable; unique when present |
| `picture` | text | profile image URL from Google; nullable |
| `user_name` | text | nullable; unique when present; lowercase login handle for the admin password path |
| `password_hash` | text | nullable; `scrypt$<saltHex>$<keyHex>` format |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique indexes on `email`, `google_id`, and `user_name`.

### `login_otp`
Short-lived 6-digit email sign-in codes. Stored in plain text on purpose — an admin can read the code out of the DB / server logs when SES delivery is broken. Rows live ~10 minutes, are opportunistically swept on every new code request, and are burned on successful verify or after 5 wrong attempts.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `user.id`; **unique** — at most one live OTP per user |
| `email` | text | denormalized for fast lookup; lowercase |
| `code` | text | the 6-digit code, plain text |
| `attempts` | int | wrong-attempt counter; row burns at 5 |
| `expires_at` | timestamptz | hard cutoff (~10 min from `created_at`) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique index on `user_id` — `POST /api/auth/email` upserts on this column, replacing the code, expiry, and attempt counter on every resend (outside the 30 s cooldown). Auxiliary indexes: `email` (verification lookup) and `expires_at` (opportunistic sweep).

### `tutor_session`
One row per tutoring sitting. A user starts a new session each time they begin tutoring; the session holds the chat transcript and the uploaded image(s).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `user.id` |
| `current_image_id` | uuid | nullable; most recent image attached to the session |
| `guidance_level` | text | `guided` \| `balanced` \| `direct` — Brain's pacing for this session |
| `subject` | text | `math` \| `thinking` \| `reading` \| `writing` — subject this session is anchored to |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | nullable |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `session_image`
Photos uploaded into a session (worksheets, exam pages, plus any freehand strokes the student drew — strokes are flattened into the bytes before upload). One session can have multiple images; sending the same bytes twice deduplicates by `content_hash`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK → `tutor_session.id` |
| `content_hash` | text | sha256 of the flattened canvas bytes; unique within a session |
| `storage_url` | text | S3 URL (prod) or `file://` path (dev) |
| `width` | int | pixel dimensions of the source image |
| `height` | int | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique index on `(session_id, content_hash)`.

### `tutor_session.current_image_id`
The most recently active `session_image` for the session. Text-only turns reuse the bytes referenced by this id; uploading a new image (different `content_hash`) advances it.

### `image_ocr`
Cheap, deterministic OCR pre-pass on the flattened image bytes. Populated asynchronously by the EasyOCR sidecar once per `image_id` (`ensureImageOcr.js`). Brain queries this through `find_text_on_image` to get tight bboxes for printed worksheet text without paying for a VLM call; Eyes (`vision_extraction`) remains the fallback for handwriting, math notation, and diagrams.

| Column | Type | Notes |
|---|---|---|
| `image_id` | uuid | PK + FK → `session_image.id` (one OCR row per image) |
| `status` | text | `pending` \| `ready` \| `failed` |
| `lines` | jsonb | array of `{ text, confidence, bbox: [x, y, w, h] }`, normalized 0..1; null until `ready` |
| `error` | text | failure message when `status='failed'`; null otherwise |
| `model_version` | text | e.g. `easyocr-1.7.2/craft+crnn` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Insert uses `onConflictDoNothing` so the row is created exactly once per image. Find-text matches consume corner bboxes; `lines.bbox` stays in xywh on disk and gets translated to `[x1, y1, x2, y2]` on the way out.

### `vision_extraction`
Cache layer for Brain's on-demand vision lookups. Each row is one `lookup_on_image(question)` call's result, keyed by `(image_id, sha256(question))` so repeated lookups during a session are free. The image_id changes whenever the photo bytes change (including when the student adds or erases strokes), which naturally invalidates the cache.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `image_id` | uuid | FK → `session_image.id` |
| `region_hash` | text | sha256(question) — names a question, not a region. Nullable for legacy rows. |
| `region_bbox` | jsonb | unused under the on-demand pipeline; kept nullable for back-compat |
| `extracted` | jsonb | `{ question, answer, bbox? }` from Qwen2.5-VL |
| `confidence` | numeric | nullable; provider-self-reported confidence if available |
| `model_version` | text | e.g. `qwen/qwen2.5-vl-72b-instruct` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique index on `(image_id, region_hash)`.

> Note on the `region_hash` column name: kept for migration compatibility. Semantically it now stores a question hash, not a geometric region hash.

### `session_message`
Chat transcript. Ordered by `created_at`. Only `user` and `assistant` messages are persisted — Brain's intermediate tool calls and Eyes' tool replies stay in-memory during the turn and are not stored.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK → `tutor_session.id` |
| `role` | text | `user` \| `assistant` |
| `content` | text | message body |
| `image_id` | uuid | nullable; FK → `session_image.id` (the active image when the turn was sent) |
| `region_hash` | text | nullable; legacy column, unused under the on-demand pipeline |
| `model_id` | text | model that produced an `assistant` row (e.g. `deepseek/deepseek-chat`) |
| `prompt_tokens` | int | from chat API response |
| `completion_tokens` | int | |
| `interrupted` | boolean | true if the user hit Stop mid-stream |
| `tool_calls` | jsonb | user-visible tool calls (currently `draw_annotation` only); null when none |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `session_report`
Post-session classification report. One row per session; lazy-generated by `generateSessionReport` when `POST /api/analysis-report` rolls a user's sessions up into an analysis report, and **incrementally refreshed** as the session continues. Because `session_message` is append-only, staleness is the simple check `cursor_message_id != latest_message_id`. When stale and a prior `ready` row exists with `questions` and a `cursor_message_id`, the generator loads only messages strictly after `cursor_message_at` and asks the LLM to *merge* the prior question list with new messages — never re-summarizing already-folded data.

| Column | Type | Notes |
|---|---|---|
| `session_id` | uuid | PK + FK → `tutor_session.id` |
| `status` | text | `pending` \| `ready` \| `failed` |
| `summary` | text | adult-facing 2–3 sentence overview |
| `questions` | jsonb | array of `{ question, studentAnswer, correctAnswer, correct, mistakeType, mistakeNotes, nswOutcomeCode, nswOutcomeText, nswFocusArea, nswStrand, nswStage, nswSubject }` |
| `cursor_message_id` | uuid | FK → `session_message.id`; last message folded in. NULL means never generated. |
| `cursor_message_at` | timestamptz | mirrors the cursor message's `created_at`; used to query "messages since" without a JOIN |
| `model_version` | text | LLM that produced the row |
| `error` | text | failure message when `status='failed'` |
| `prompt_tokens` | int | |
| `completion_tokens` | int | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `subject_report`
Rollup of all of a user's `session_report` rows for one `(user, subject)`, driven by a user prompt. **Immutable once generated** — every generation request inserts a new row, so the Reports page shows a full history of past reports the user can scroll through and re-open. The only mutation on a row is its `pending → ready/failed` state transition during the original generation (with one extra write in between for the pre-generated title — see below).

Every report is the same shape: subject + prompt → markdown narrative + optional bullet sections + an LLM-generated title. The frontend offers a few prompt templates ("Wrong Answer Journal", "Strengths & Weaknesses", "Curriculum Map") that prefill the textarea, but the backend never sees these as distinct types.

On generation the orchestrator kicks off a small title-only LLM call in parallel with refreshing any stale `session_report` rows; the title lands in `content = { title }` within a couple of seconds so the polling UI can stop showing a placeholder long before the main generation finishes. The main LLM call then produces the full report and overwrites `content` with `{ title, narrative, sections? }`. The LLM is fed the *structured* session data, never raw transcripts — that keeps cost bounded and is the only thing user prompts see.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `user.id` |
| `subject` | text | `math` \| `thinking` \| `reading` \| `writing` |
| `custom_prompt` | text | verbatim user prompt (column name predates the prompt-only design) |
| `status` | text | `pending` \| `ready` \| `failed` |
| `content` | jsonb | `{ title, narrative, sections? }` once ready; `{ title }` briefly while pending |
| `narrative` | text | denormalised copy of `content.narrative` for quick text searches |
| `included_sessions` | jsonb | snapshot `[{ sessionId, cursorMessageId }]` of which session reports were folded in. Audit trail of what the row was built from. |
| `model_version` | text | LLM that produced the row |
| `prompt_tokens` | int | |
| `completion_tokens` | int | |
| `error` | text | |
| `generated_at` | timestamptz | when `status` flipped to `ready` |
| `created_at` | timestamptz | when the row was first inserted (`pending`) |
| `updated_at` | timestamptz | |

Indexed by `(user_id, created_at DESC)` to keep the Reports page list scan tight as history grows.

## Relationships

```
user ──< login_otp
user ──< tutor_session ──< session_image ──┬── image_ocr (1:1)
     │                 │                   └──< vision_extraction
     │                 ├──< session_message ──┐
     │                 │                      └─ optional FK → session_image
     │                 └── session_report (1:1) ── cursor_message_id → session_message
     └──< subject_report  (1:N, immutable rows — full history per (user, subject))
```
