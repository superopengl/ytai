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
   - **Right**: chat panel showing AI tutor messages, with a "Stop" button to interrupt streaming and a "Circle something new" button to re-run vision extraction
4. **Admin** (`/admin`) — Dashboard listing users, sessions, image uploads, token usage, and approve/reject actions

## How It Works

1. User visits the homepage, clicks "Start Tutoring," logs in, waits for admin approval
2. On the Tutor page, they **take a photo** with their phone (`<input capture="environment">`) or upload an image of the worksheet/exam
3. Image uploads to S3 (or local disk in dev); the URL is stored on the session
4. **Qwen2.5-VL ("Eyes") runs once** on the raw photo and returns a structured JSON: list of questions, marked answers (correct/wrong/blank), and any visible teacher feedback (red Xs, ticks, written notes). Qwen2.5-VL is also asked to return bounding boxes per item so Brain can later reference them by id.
5. The AI greets the student, summarizes what it sees on the page, flags any wrong answers, and asks "What can I help you with?"
6. The student types a question OR **circles a region** on the canvas and asks "explain this"
7. **If the student circled a region**: the canvas drawing layer is flattened with the photo, OR the circled region is cropped client-side from drawn coordinates → sent to Qwen2.5-VL, which returns the text inside that region
8. The extracted text is appended to the chat context, and **deepseek-v4-flash ("Brain")** generates a tutoring response, streamed token-by-token to the chat panel
9. The student can hit **Stop** at any time to interrupt and redirect
10. Repeat from step 6 until the student is done; session ends, transcript is stored

## Architecture

The app runs an eyes/brain AI pipeline (Qwen2.5-VL for vision, deepseek-v4-flash for chat — both accessed via OpenRouter) behind a Fastify backend and a React + Ant Design frontend. Vision calls are minimized and cached; chat streams over SSE with abort support.

Full architecture documentation: [docs/architecture.md](docs/architecture.md)

Pipeline flow diagram: [docs/pipeline.md](docs/pipeline.md)

## Database

PostgreSQL with Drizzle ORM. Tables: `user`, `login_request`, `tutor_session`, `session_image`, `session_message`, `vision_extraction`. UUID primary keys, singular table names, automatic `created_at`/`updated_at`.

Schema in `src/api/db/schema.js`, migrations in `src/api/drizzle/`.

Full schema documentation: [docs/db-schema.md](docs/db-schema.md)

## API

Fastify HTTP API. All routes prefixed with `/api` except `/healthcheck`. Auth via JWT.

Summary:
- `GET /healthcheck` — public
- `POST /api/login/user` — login request
- `GET /api/login/:loginRequestId/status` — poll login status
- `POST /api/admin/user` — create a user (admin)
- `POST /api/tutor/session` — start a tutoring session (auth)
- `POST /api/tutor/:sessionId/image` — upload photo, triggers Qwen2.5-VL extraction (auth)
- `POST /api/tutor/:sessionId/circle` — submit a circled region, triggers Qwen2.5-VL on the crop (auth)
- `POST /api/tutor/:sessionId/message` — send chat message, streams deepseek-v4-flash response via SSE (auth)
- `GET /api/tutor/:sessionId` — get session state + transcript (auth)

Full API documentation: [docs/api-schema.md](docs/api-schema.md)

## Tech Stack

- **Frontend**: React 19, Ant Design 6, Vite, react-router-dom v7
- **Annotation canvas**: Konva.js (image background + drawing layer + region cropping)
- **Math rendering**: KaTeX
- **Backend**: Node.js, Fastify
- **Database**: PostgreSQL with Drizzle ORM
- **Image storage**: S3 in production, local disk in dev
- **AI — Vision (Eyes)**: **Qwen2.5-VL** (default: `qwen/qwen2.5-vl-72b-instruct`) via OpenRouter; strong visual grounding (returns bounding boxes)
- **AI — Chat (Brain)**: **deepseek-v4-flash** via OpenRouter; streaming, abortable
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

## Open Questions to Resolve During Build

1. **Streaming transport**: SSE vs. WebSocket? SSE is simpler and natively supports `AbortController`. Default to SSE; revisit if we add voice or multi-user shared sessions.
2. **Voice in/out**: Whisper (STT) + ElevenLabs (TTS) is the cheap path. Defer to v2.
3. **Multi-user shared session**: parent + student on different devices in the same session. Defer to v2.
4. **Confidence fallback for Eyes**: if Qwen2.5-VL misreads handwriting, what's the recovery? Options: ask the user to re-circle, ask them to type the question, or send the crop to a second-opinion vision model. Decide after first user testing.
5. **Subject-specific tools**: math step-checker (sympy), writing rubric grader. Add as Brain-side tool calls once core loop works.
