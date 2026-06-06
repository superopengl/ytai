# YouTutorAI

## Product Vision

YouTutorAI is an AI-powered homework and exam tutor for students aged 8-14, covering math, thinking skills, English, and writing. The user (a parent, teacher, or the student themself) snaps a photo of a worksheet or exam, and the AI reads the questions, identifies which answers are wrong, and tutors the student through any question they ask about. The student can circle or highlight regions on the photo to point at exactly what they're stuck on, and the AI explains in age-appropriate, Socratic language — scaffolding understanding rather than dumping answers. Conversations are interruptible: the student can stop the AI mid-explanation and redirect, the way a real tutor session feels.

## Target Users

Students aged 8-14, plus the parents and teachers who help them. Three personas share the same UI:
- **Student** — the primary learner; UX is kid-friendly, encouraging, and never gives away answers without working through the reasoning
- **Parent** — wants to help their kid with homework but may not remember the material themself; uses YouTutorAI as a co-tutor
- **Teacher** — wants a tool to assign for homework support or to walk through tricky problems with a student

## Core UI

Multi-page app with these views:

1. **Homepage** (`/`) — Public landing page with feature highlights and a "Sign in with Google" entry point. Inline buttons also link to the full `/login` page for the email-OTP and admin-password paths.
2. **Login** (`/login`) — Three sign-in paths in one card: Google SSO (preferred, one-tap), email OTP (6-digit code sent via SES; auto-creates a student on first sign-in), and an Admin tab with username + password (only role=admin users can log in here).
3. **Tutor** (`/tutor/:sessionId`) — Split-panel layout:
   - **Left**: photo capture / upload screen → switches to annotated image canvas (Konva.js) where the user can circle, highlight, and draw on top of the photo
   - **Right**: chat panel showing AI tutor messages, with a "Stop" button to interrupt streaming
4. **Analysis Reports** (`/reports`) — AntDesign Splitter layout: left panel lists every generated report (tagged with subject + LLM-generated title + timestamp) as a scrollable history; right panel shows the selected report viewer, or — when nothing is selected — a "Generate a new report" pane: pick a subject, optionally prefill from a prompt template, edit, and hit Generate. Every generation inserts a new immutable `subject_report` row.
5. **Admin** (`/admin`) — Dashboard listing users, sessions, image uploads, and token usage

Plus public utility pages: `/privacy_policy`, `/terms_of_use`, `/logo` (brand sheet).

## How It Works

1. User visits the homepage and signs in via one of: Google SSO (one-tap), email OTP (`/login`, 6-digit code), or — admins only — username + password (`/login` → Admin tab).
2. On the Tutor page, they **take a photo** with their phone (`<input capture="environment">`) or upload an image of the worksheet/exam. They may circle, underline, or highlight regions on top of the photo with the pen tools.
3. When the student sends their first message, the canvas (photo + freehand strokes) is flattened to a single PNG and POSTed alongside the message. Each upload writes its own S3 object (key = the new `session_image.id`); the session remembers the active image id.
4. **Brain — a multimodal model (default: Gemma 4)** — runs on every turn. The latest user message carries every page of the active doc as an `image_url` block, so Brain reads the printed text, the student's handwriting, diagrams, and any freehand marks directly. No separate Eyes call; no OCR sidecar.
5. Brain may call `draw_annotation` to point at exactly what it's talking about. The bbox comes from Brain's own visual estimation. Tokens stream to the chat panel; `draw_annotation` calls render on the canvas.
6. The student can hit **Stop** at any time to interrupt Brain mid-stream.
7. Repeat until the session ends; transcript is stored.

## Architecture

Brain is a multimodal LLM that handles chat, reading, and visual reasoning in one call. The Konva canvas exports the photo + freehand strokes as one flattened PNG, so Brain sees the student's circles and underlines as part of the page. Page bytes attach to the latest user message every turn; prior turns stay text-only in conversation history. `draw_annotation` is the only tool — Brain emits a normalized 0..1 bbox over a page and the frontend renders the mark on the canvas. Chat streams over SSE with abort support.

Brain goes through any OpenAI-compatible `/v1/chat/completions` endpoint. In dev we point at LM Studio with Gemma 4 (`YTAI_OPENROUTER_BASE_URL=http://localhost:9529/v1`); in prod, OpenRouter.

Full architecture documentation: [docs/architecture.md](docs/architecture.md)

Pipeline flow diagram: [docs/pipeline.md](docs/pipeline.md)

## Reporting

Two-tier rollup, both layers lazy + cached:

1. **`session_report`** (one per session, structured `questions[]` + summary) — lazy-generated on first GET. Carries `cursor_message_id` pointing at the last folded `session_message`. Because messages are append-only and immutable, staleness is the trivial check `cursor != latest`. On refresh, only messages strictly after the cursor are loaded and the prior `questions[]` is passed to the LLM as starting context — merge, not re-summarize.
2. **`subject_report`** (N per `(user, subject)`, immutable once generated) — on-demand rollup of all of a user's session reports for one subject, driven entirely by a user prompt. Every generation request inserts a fresh row carrying its own `created_at`, so the Reports page renders a complete history of past reports the user can re-open at any time. The frontend offers a small set of prompt templates ("Wrong Answer Journal", "Strengths & Weaknesses", "Curriculum Map") that prefill the textarea — the backend never sees these as distinct types, just as prompts. Each report's display name is an LLM-generated title that lands in `content.title` within seconds of the row being created (pre-title call runs in parallel with the session refresh). The main generation feeds the LLM the *structured* session data, never raw transcripts.

Subjects are the fixed 4-enum (math / thinking / reading / writing), bound 1:1 to a session and immutable.

## Database

PostgreSQL with Drizzle ORM. Tables: `user`, `login_otp`, `tutor_session`, `session_doc`, `session_image`, `session_message`, `tts_audio`, `session_report`, `subject_report`, `llm_usage`. UUID primary keys, singular table names, automatic `created_at`/`updated_at`. `user` carries `auth_provider` (`local` | `google` | `email`), `email`, `google_id`, `picture`, plus the admin-only `local_login_user_name` + `password_hash` (scrypt) pair; `email`, `google_id`, and `local_login_user_name` are unique. `login_otp` stores 6-digit email codes in plain text so an admin can read them back when SES delivery fails.

Schema in `src/api/db/schema.js`, migrations in `src/api/drizzle/`.

Full schema documentation: [docs/db-schema.md](docs/db-schema.md)

## API

Fastify HTTP API. All routes prefixed with `/api` except `/healthcheck`. Auth via JWT.

Summary:
- `GET /healthcheck` — public
- `POST /api/auth/google` — verify a Google Identity Services ID token, upsert the user (linking by `google_id` then `email`), return a YTAI JWT (`{ token, user }`). Returns 503 if `YTAI_GOOGLE_CLIENT_ID` is unset.
- `POST /api/auth/email` — issue a 6-digit OTP for an email, store it plain text in `login_otp` (admin can read it out if SES delivery fails), and best-effort send via AWS SES. Auto-creates a user on first request.
- `POST /api/auth/otp` — verify a 6-digit code, burn the row, return the same `{ token, user }` shape as Google. 5-wrong-attempts and 10-minute TTL guard against brute force.
- `POST /api/auth/password` — admin-only username + password sign-in. Verifies the scrypt hash; only `role='admin'` users can sign in here. Every failure returns the same generic 401. Bootstrapped via `YTAI_ADMIN_USERNAME` / `YTAI_ADMIN_PASSWORD`, defaulting to `admin` / `adminadmin` so a fresh checkout has a working admin.
- `POST /api/admin/password` — admin-only. Change the signed-in admin's own password. Verifies `currentPassword` against the stored scrypt hash and writes a fresh scrypt hash for `newPassword` (min 8 chars). The bootstrap admin's password is re-asserted from `YTAI_ADMIN_PASSWORD` on every server restart, so a change made here is reverted on next restart unless the env var is updated too.
- `DELETE /api/admin/user/:id/data` — admin-only. Wipe every content row tied to a student account (sessions, docs, images, messages, session/subject reports). User row, login_otp, the shared tts_audio cache, and `llm_usage` (per-call billing audit, must outlive the wiped entities) are kept. 409 if the target user is not `role='student'`. Whole wipe runs in one transaction.
- `GET /api/admin/user/:id/token-usage` — admin-only. Per-day token + cost aggregates from `llm_usage`, grouped by `(date, purpose, model)`. Drives the admin dashboard's "Token usage" stacked-column chart, which the frontend reshapes split by either purpose or model.
- `POST /api/tutor/session` — start a tutoring session
- `PATCH /api/tutor/:sessionId` — update a session in place. Body accepts any combination of `guidanceLevel`, `subject`, and `currentDocId` (set to a doc UUID owned by this session, or `null` to clear). Validates each field against its enum, verifies the target doc belongs to the session, and returns the patched fields.
- `GET /api/tutor/:sessionId/messages` — fetch transcript
- `POST /api/tutor/:sessionId/message` — send chat message; streams Brain's response over SSE. Each page of the active doc is attached to the user message as an `image_url` block so the multimodal Brain reads the worksheet directly. Brain may call `draw_annotation` to point at the page; per-turn freehand-canvas bytes override the original photo when the student drew on it for that turn.
- `POST /api/tutor/:sessionId/speak` — synthesize one sentence of MP3 audio (frontend buffers and chunks Brain's stream by sentence). Cached in `tts_audio` per `sha256(text + voice + model)` so kid-tutor catchphrases ("nice work!") are free on repeat. Returns 503 if `YTAI_TTS_BASE_URL` is unset.
- `GET /api/analysis-reports` — list every analysis report for the current user, newest first.
- `POST /api/analysis-report` — generate a new analysis report. Every call inserts a new immutable row (no in-place refresh). Body: `{ subject, prompt }`. Prompts are capped at 2000 chars and only ever see structured session data, never raw transcripts.
- `DELETE /api/analysis-report/:id` — delete a report owned by the current user.

Full API documentation: [docs/api-schema.md](docs/api-schema.md)

## Tech Stack

- **Frontend**: React 19, Ant Design 6, Vite, react-router-dom v7
- **Annotation canvas**: Konva.js (image background + drawing layer + region cropping)
- **Math rendering**: KaTeX
- **Backend**: Node.js, Fastify
- **Database**: PostgreSQL with Drizzle ORM
- **Image storage**: S3 in production, local disk in dev
- **AI — Brain (multimodal chat + vision)**: any OpenAI-compatible multimodal model. Default `google/gemma-4-e4b` via LM Studio in dev; can swap for OpenRouter-hosted multimodal models (`google/gemini-2.5-pro`, `openai/gpt-4o`, etc.) in prod. Streaming, abortable, tool-call enabled.
- **AI — Voice (TTS)**: **Kokoro-82M** via [`Kokoro-FastAPI`](https://github.com/remsky/Kokoro-FastAPI) (OpenAI-compatible `/audio/speech`); runs as a Docker sidecar in dev (`pnpm start:local:tts`). Configurable via `YTAI_TTS_BASE_URL` — any compatible provider works.
- **Streaming**: SSE (Server-Sent Events)
- **Package manager**: pnpm (workspace monorepo — root `@techseeding/yoututorai`, `@techseeding/yoututorai-portal`, `@techseeding/yoututorai-deploy`)
- **Cloud / IaC**: AWS, CDK v2 (JavaScript), region `ap-southeast-2` (Sydney)

## Coding Conventions

- **One export per file** — each JS/TS file has a single default export function. Filename matches the exported function name (e.g. `tutorSendMessage.js` exports `function tutorSendMessage`).
- **All API routes under `/api`** — every backend endpoint uses the `/api/` prefix. SPA fallback serves `index.html` for non-`/api/` paths.
- **One route controller per file** — each route lives in its own file under `src/api/routes/`.
- **Shared logic in `lib/`** — reusable utilities go in `src/api/lib/`, one function per file.
- **Design tokens in `theme.js`** — no hardcoded colors in components.
- **Prefer Ant Design components** — reach for an `antd` component (Button, Modal, Form, Splitter, etc.) before writing a custom one or pulling in another UI library. Style via the `theme.js` tokens and AntD's component-level overrides, not by reinventing the primitive.
- **Logical commits** — separate by concern (backend, frontend, schema, infra).
- **Single transaction is preferred for each API invocation** — each route controller should wrap all of its DB operations in one transaction via `withTx(async (tx) => { ... })` from [src/api/db/index.js](src/api/db/index.js), and pass `tx` to every drizzle call inside. The pattern: do CPU/IO work that doesn't need DB (decode, hash, validate inputs) up front, then enter the transaction for all reads + writes, then do post-commit work (fire-and-forget background jobs, response streaming) outside. Early-return error cases should return a discriminated result from the tx callback and translate to HTTP status codes after the tx settles, so the rollback semantics stay obvious. Exceptions: streaming SSE endpoints (e.g. `tutorSendMessage`) and any handler that does long external IO between writes — pinning a Postgres connection for the duration of an LLM stream exhausts the pool, so those use discrete short transactions.

## Commands

```bash
pnpm install            # install all dependencies
pnpm dev                # local dev: Fastify + Vite dev server (loads .env)
pnpm build:prod         # build frontend to dist/public/, copy backend to dist/src/
pnpm build:docker       # build production Docker image
pnpm start:prod         # production: Fastify from dist/ (loads .env.production)
pnpm db:generate        # generate Drizzle migration from schema changes
pnpm db:migrate         # run pending migrations
pnpm db:studio          # open Drizzle Studio

pnpm start:local:tts    # boot Kokoro-FastAPI sidecar for local voice (port 9530)
pnpm stop:local:tts     # tear it down

pnpm -F @techseeding/yoututorai-deploy synth
pnpm -F @techseeding/yoututorai-deploy diff
pnpm -F @techseeding/yoututorai-deploy deploy
pnpm -F @techseeding/yoututorai-deploy migrate
```

## Environment

Two environments: **local dev** and **production**.

| File | Environment | Git-tracked |
|---|---|---|
| `.env` | Local development | No |
| `.env.production` | Production | No |
| `.env.sample` | Template | Yes |

All env vars prefixed with `YTAI_`.

| Variable | Description | Default |
|---|---|---|
| `YTAI_DATABASE_URL` | PostgreSQL connection string | `postgres://localhost:5432/yoututorai` |
| `YTAI_API_PORT` | API server port | `9521` |
| `YTAI_PORTAL_PORT` | Vite dev server port | `9522` |
| `YTAI_JWT_SECRET` | JWT signing secret | *(required)* |
| `YTAI_GOOGLE_CLIENT_ID` | OAuth 2.0 Web Client ID from the Google Cloud Console. Enables the "Sign in with Google" button on the homepage / `/login` page and the `POST /api/auth/google` route. Unset disables Google SSO. | *(unset)* |
| `YTAI_ADMIN_USERNAME` | Username for the boot-time admin upsert. With `YTAI_ADMIN_PASSWORD`, the server ensures a `role='admin'` user exists with this hash on every restart. | `admin` |
| `YTAI_ADMIN_PASSWORD` | Plain password hashed (scrypt) and persisted as `user.password_hash` on boot. Used to verify `POST /api/auth/password`. Default exists so a fresh checkout has a working admin — **change it for any non-dev deploy**. | `adminadmin` |
| `YTAI_SES_FROM_EMAIL` | Verified SES sender for sign-in OTP emails. Unset → SES is skipped; codes are still issued and visible in server logs / the DB. | *(unset)* |
| `YTAI_AWS_REGION` | AWS region used by the SES client | `ap-southeast-2` |
| `YTAI_OPENROUTER_API_KEY` | API key for the chat endpoint. Any non-empty value works against LM Studio. | *(required)* |
| `YTAI_OPENROUTER_CHAT_MODEL` | Multimodal Brain model id | `google/gemma-4-e4b` |
| `YTAI_OPENROUTER_BASE_URL` | OpenAI-compatible `/v1/chat/completions` endpoint. Point at LM Studio in dev (`http://localhost:9529/v1`). Defaults to OpenRouter. | `https://openrouter.ai/api/v1` |
| `YTAI_S3_BUCKET` | Bucket for session images and TTS audio. Unset → local-disk fallback (dev only). | *(required in prod)* |
| `YTAI_S3_PREFIX` | Key namespace inside `YTAI_S3_BUCKET`. CDK sets this to the deployed stage (`prod`). Local dev defaults to `dev` so a misconfigured laptop can't write into prod's keyspace. | `dev` |
| `YTAI_SES_FROM_EMAIL` | Verified AWS SES sender identity for sign-in OTP emails. Unset disables SES (the OTP still lands in the DB and logs so an operator can read it back). | *(unset)* |
| `YTAI_AWS_REGION` | AWS region for SES and S3. Standard `AWS_*` credentials (env, shared config, IAM role) are resolved by the SDK chain. | `ap-southeast-2` |
| `YTAI_TTS_BASE_URL` | OpenAI-compatible `/audio/speech` endpoint (e.g. local Kokoro at `http://localhost:9530/v1`). Unset disables voice (route returns 503, UI greys out). | *(unset)* |
| `YTAI_TTS_API_KEY` | Optional auth for the TTS endpoint | *(unset)* |
| `YTAI_TTS_MODEL` | TTS model id | `kokoro` |
| `YTAI_TTS_VOICE` | Default voice id (Kokoro: `af_heart`, `af_bella`, `am_adam`, …) | `af_heart` |
| `YTAI_AUDIO_DIR` | Local disk path for cached MP3 bytes | `./data/audio` |

## Open Questions to Resolve During Build

1. **Streaming transport**: SSE vs. WebSocket? SSE is simpler and natively supports `AbortController`. Default to SSE; revisit if we add voice or multi-user shared sessions.
2. **Voice in/out**: Whisper (STT) + ElevenLabs (TTS) is the cheap path. Defer to v2.
3. **Multi-user shared session**: parent + student on different devices in the same session. Defer to v2.
4. **Confidence fallback for handwriting**: if Brain misreads handwriting, what's the recovery? Options: ask the user to re-circle, ask them to type the question, or send the page to a second-opinion model. Decide after first user testing.
5. **Subject-specific tools**: math step-checker (sympy), writing rubric grader. Add as Brain-side tool calls once core loop works.
