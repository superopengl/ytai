# YouTutorAI

## Product Vision

YouTutorAI is an AI-powered homework and exam tutor for students aged 8-14, covering math, thinking skills, English, and writing. The user (a parent, teacher, or the student themself) snaps a photo of a worksheet or exam, and the AI reads the questions, identifies which answers are wrong, and tutors the student through any question they ask about. The student can circle or highlight regions on the photo to point at exactly what they're stuck on, and the AI explains in age-appropriate, Socratic language — scaffolding understanding rather than dumping answers. Conversations are interruptible: the student can stop the AI mid-explanation and redirect, the way a real tutor session feels.

## Target Users

Students aged 8-14, plus the parents and teachers who help them. Three personas share the same UI:
- **Student** — the primary learner; UX is kid-friendly, encouraging, and never gives away answers without working through the reasoning
- **Parent** — wants to help their kid with homework but may not remember the material themself; uses YouTutorAI as a co-tutor
- **Teacher** — wants a tool to assign for homework support or to walk through tricky problems with a student

## Core UI

Multi-page app with four views:

1. **Homepage** (`/`) — Public landing page with feature highlights and "Start Tutoring" CTA
2. **Login** (`/login`) — User enters their name + role (student / parent / teacher); admin approval required for MVP
3. **Tutor** (`/tutor/:sessionId`) — Split-panel layout:
   - **Left**: photo capture / upload screen → switches to annotated image canvas (Konva.js) where the user can circle, highlight, and draw on top of the photo
   - **Right**: chat panel showing AI tutor messages, with a "Stop" button to interrupt streaming
4. **Admin** (`/admin`) — Dashboard listing users, sessions, image uploads, token usage, and approve/reject actions

## How It Works

1. User visits the homepage, clicks "Start Tutoring," logs in, waits for admin approval
2. On the Tutor page, they **take a photo** with their phone (`<input capture="environment">`) or upload an image of the worksheet/exam. They may circle, underline, or highlight regions on top of the photo with the pen tools.
3. When the student sends their first message, the canvas (photo + freehand strokes) is flattened to a single PNG and POSTed alongside the message. Bytes are deduped by sha256 and persisted; the session remembers the active image id. The server kicks an async **EasyOCR pre-pass** on the bytes (writes lines to `image_ocr`) but **no upfront vision pass.**
4. **deepseek-v4-flash ("Brain")** runs on every turn. Two image tools, used in order of cheapness:
   - `find_text_on_image(query)` — looks up printed text in the EasyOCR results. Fast, tight bboxes. Returns up to 5 matches + a union bbox.
   - `lookup_on_image(question)` — falls back to Eyes for handwriting, math notation, diagrams, or anything semantic. One focused question per call.
5. **Eyes (Qwen2.5-VL)** runs on the current image bytes with that question and returns a short text answer plus, when relevant, a normalized 0..1 corner bbox. Results are cached in `vision_extraction` keyed by `(image_id, sha256(question))` so repeats during a session are free.
6. Brain may chain lookups (e.g. "what's on the page?" → "what did the student answer for question 3?") and may call `draw_annotation` with a bbox from a lookup to point at the page. Before forwarding, the server **snaps that bbox to the OCR line union** so the on-page mark hugs printed text rather than floating over whitespace. Tokens stream to the chat panel; `draw_annotation` calls render on the canvas.
7. The student can hit **Stop** at any time to interrupt Brain and any in-flight Eyes call.
8. Repeat until the session ends; transcript is stored.

## Architecture

Brain (deepseek-v4-flash) drives every turn. A cheap EasyOCR sidecar reads printed text into `image_ocr` async on upload; Brain consults it first via `find_text_on_image`, and only escalates to Eyes (Qwen2.5-VL) for handwriting, diagrams, or semantic questions. Both AI models go through OpenRouter; OCR runs locally as a Docker sidecar. Vision results are cached per `(image_id, question)` so repeats are free. The Konva canvas exports the photo + freehand strokes as one flattened PNG, so Eyes interprets the student's circles and underlines directly without coordinate-mapping. `draw_annotation` bboxes are snapped to the OCR line union before rendering so marks hug actual text. Chat streams over SSE with abort support.

Full architecture documentation: [docs/architecture.md](docs/architecture.md)

Pipeline flow diagram: [docs/pipeline.md](docs/pipeline.md)

## Database

PostgreSQL with Drizzle ORM. Tables: `user`, `login_request`, `tutor_session`, `session_image`, `image_ocr`, `session_message`, `vision_extraction`, `tts_audio`. UUID primary keys, singular table names, automatic `created_at`/`updated_at`.

Schema in `src/api/db/schema.js`, migrations in `src/api/drizzle/`.

Full schema documentation: [docs/db-schema.md](docs/db-schema.md)

## API

Fastify HTTP API. All routes prefixed with `/api` except `/healthcheck`. Auth via JWT.

Summary:
- `GET /healthcheck` — public
- `POST /api/login/user` — login request *(planned)*
- `GET /api/login/:loginRequestId/status` — poll login status *(planned)*
- `POST /api/admin/user` — create a user (admin) *(planned)*
- `POST /api/tutor/session` — start a tutoring session
- `GET /api/tutor/:sessionId/messages` — fetch transcript
- `POST /api/tutor/:sessionId/message` — send chat message; streams deepseek-v4-flash response over SSE. Brain hits `find_text_on_image` (EasyOCR cache) first and `lookup_on_image` (Qwen2.5-VL) for anything OCR can't answer. Vision results cached in `vision_extraction` per `(image_id, sha256(question))`; OCR results cached in `image_ocr` per `image_id`.
- `POST /api/tutor/:sessionId/speak` — synthesize one sentence of MP3 audio (frontend buffers and chunks Brain's stream by sentence). Cached in `tts_audio` per `sha256(text + voice + model)` so kid-tutor catchphrases ("nice work!") are free on repeat. Returns 503 if `YTAI_TTS_BASE_URL` is unset.

Full API documentation: [docs/api-schema.md](docs/api-schema.md)

## Tech Stack

- **Frontend**: React 19, Ant Design 6, Vite, react-router-dom v7
- **Annotation canvas**: Konva.js (image background + drawing layer + region cropping)
- **Math rendering**: KaTeX
- **Backend**: Node.js, Fastify
- **Database**: PostgreSQL with Drizzle ORM
- **Image storage**: S3 in production, local disk in dev
- **AI — Vision (Eyes)**: **Qwen2.5-VL** (default: `qwen/qwen2.5-vl-72b-instruct`) via OpenRouter; called on demand by Brain through the `lookup_on_image` tool
- **AI — Chat (Brain)**: **deepseek-v4-flash** via OpenRouter; streaming, abortable, tool-call enabled
- **OCR**: **EasyOCR 1.7.2** (CRAFT detector + CRNN recognizer, English, CPU PyTorch) behind a FastAPI sidecar (`devops/ocr/`). Runs locally via `pnpm start:local:ocr` on port 9531. Drives the `find_text_on_image` tool and the OCR-snap on `draw_annotation`. Optional — when `YTAI_OCR_BASE_URL` is unset Brain falls back to Eyes for everything.
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
- **Logical commits** — separate by concern (backend, frontend, schema, infra).

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
pnpm start:local:ocr    # boot EasyOCR sidecar for local OCR (port 9531)
pnpm stop:local:ocr     # tear it down

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
| `YTAI_PUBLIC_URL` | Public-facing app origin | `http://localhost:9522` |
| `YTAI_JWT_SECRET` | JWT signing secret | *(required)* |
| `YTAI_OPENROUTER_API_KEY` | OpenRouter API key (used for both Eyes and Brain) | *(required)* |
| `YTAI_OPENROUTER_CHAT_MODEL` | Brain model id on OpenRouter | `deepseek/deepseek-chat` |
| `YTAI_OPENROUTER_VISION_MODEL` | Eyes model id on OpenRouter | `qwen/qwen2.5-vl-72b-instruct` |
| `YTAI_OPENROUTER_BASE_URL` | Override the OpenRouter base URL | `https://openrouter.ai/api/v1` |
| `YTAI_VISION_BASE_URL` | Per-route override for Eyes (e.g. local LM Studio at `http://localhost:9529/v1`); falls back to OpenRouter when unset | *(unset)* |
| `YTAI_VISION_API_KEY` | API key for the vision override endpoint | *(unset)* |
| `YTAI_S3_BUCKET` | Image bucket (prod) | *(required in prod)* |
| `YTAI_IMAGE_RETENTION_DAYS` | Auto-delete uploaded images after N days | `30` |
| `YTAI_TTS_BASE_URL` | OpenAI-compatible `/audio/speech` endpoint (e.g. local Kokoro at `http://localhost:9530/v1`). Unset disables voice (route returns 503, UI greys out). | *(unset)* |
| `YTAI_TTS_API_KEY` | Optional auth for the TTS endpoint | *(unset)* |
| `YTAI_TTS_MODEL` | TTS model id | `kokoro` |
| `YTAI_TTS_VOICE` | Default voice id (Kokoro: `af_heart`, `af_bella`, `am_adam`, …) | `af_heart` |
| `YTAI_AUDIO_DIR` | Local disk path for cached MP3 bytes | `./data/audio` |
| `YTAI_OCR_BASE_URL` | OCR sidecar URL (e.g. local EasyOCR at `http://localhost:9531`). Unset disables OCR — `find_text_on_image` returns `unavailable` and `draw_annotation` skips the snap step. | *(unset)* |
| `YTAI_OCR_API_KEY` | Optional auth for the OCR endpoint | *(unset)* |
| `YTAI_OCR_MIN_CONFIDENCE` | Sidecar-side floor for OCR line confidence; lines below this are dropped before they reach the API | `0.3` |

## Open Questions to Resolve During Build

1. **Streaming transport**: SSE vs. WebSocket? SSE is simpler and natively supports `AbortController`. Default to SSE; revisit if we add voice or multi-user shared sessions.
2. **Voice in/out**: Whisper (STT) + ElevenLabs (TTS) is the cheap path. Defer to v2.
3. **Multi-user shared session**: parent + student on different devices in the same session. Defer to v2.
4. **Confidence fallback for Eyes**: if Qwen2.5-VL misreads handwriting, what's the recovery? Options: ask the user to re-circle, ask them to type the question, or send the crop to a second-opinion vision model. Decide after first user testing.
5. **Subject-specific tools**: math step-checker (sympy), writing rubric grader. Add as Brain-side tool calls once core loop works.
