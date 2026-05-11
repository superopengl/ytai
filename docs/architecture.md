# YouTutorAI Architecture

## AI Pipeline — Brain drives, Eyes answers

Two-model pipeline: **Qwen2.5-VL ("Eyes")** for vision and **deepseek-v4-flash ("Brain")** for chat, both via OpenRouter. Brain runs every turn and calls Eyes as a tool when it needs to see the page.

```
[Photo upload + freehand strokes on canvas]
     │
     ▼
Frontend flattens Konva stage → PNG (strokes baked in)
     │
     ▼
POST /api/tutor/:sessionId/message
     │   Dedup by sha256(bytes); persist to disk; record as
     │   tutor_session.current_image_id. No eager vision pass.
     ▼
Brain (deepseek-v4-flash) on every chat turn
     │   System prompt = persona + "image attached, call lookup_on_image
     │   to read it"
     │   Tools = { lookup_on_image(question), draw_annotation(...) }
     ▼
For each turn:
     ├─ tokens stream out                            ──► SSE to client
     └─ tool_call: lookup_on_image(question)
              │
              ▼
         Server runs Qwen2.5-VL on the CURRENT image + the question
              │   Cached in vision_extraction by (image_id, sha256(question))
              ▼
         { answer, bbox? } feeds back as a tool message
              │
              ▼
         Brain continues (may call again, or emit final answer)

Tool: draw_annotation(shape, x, y, w, h, …)
     │   Brain uses a bbox that lookup_on_image returned to point at
     │   the page. Server forwards the call over SSE; Konva draws.
```

**Key rules**:
- Vision is on-demand. No upfront full-page extraction — VLM bbox geometry isn't stable enough to rely on a fixed schema.
- The bytes Eyes sees include the student's freehand strokes (the canvas exports the flattened stage). Eyes interprets circles, underlines, and highlights directly; the server never reasons about stroke coordinates.
- `vision_extraction` is a Q&A cache, not a schema store. Same question on the same image hits the cache; changing annotations changes the image hash and naturally invalidates.
- Brain's tool-call loop is capped at `MAX_TOOL_ROUNDS = 6` per turn as a runaway guard.
- Streaming uses SSE + `AbortController` so the Stop button kills both Brain and any in-flight Eyes call. The interrupted partial response is preserved in the transcript.

## Cost / Model Strategy

- **Eyes (Qwen2.5-VL)** is the expensive call. Strategy: run it only when Brain asks. Cache results in `vision_extraction` keyed by `(image_id, sha256(question))` so repeated lookups are free. Image-byte dedup means re-sending the same photo doesn't create a new image row.
- **Brain (deepseek-v4-flash)** runs every chat turn. Cheap. The tool-call loop may add 1–2 extra Brain round-trips per turn that needs vision, but Brain calls are still inexpensive vs Eyes.
- **Worst case per turn**: Brain → tool call → Eyes (1–3s) → Brain → tokens. Equivalent latency to the previous eager-extraction model on the first turn, *better* on text-only turns (no vision call at all).
- **Pedagogy**: deepseek-v4-flash is weaker than Claude on Socratic teaching for young kids. Compensate with a strong system prompt (see `src/api/prompts/tutorPersona.md`).

## Frontend (React + Ant Design)

- React 19 + Ant Design 6, bundled via Vite
- Routing via react-router-dom v7
- Source in `src/portal/src/`, builds to `dist/public/` (served by Fastify in production)
- Pages: `HomePage`, `LoginPage`, `TutorPage`, `AdminPage`
- Components:
  - `PhotoCapture` — `<input type="file" capture="environment">` for phone camera + upload fallback
  - `AnnotationCanvas` — Konva.js wrapper; renders the photo as a background layer and a transparent drawing layer on top; `exportImage()` returns a flattened dataUrl (strokes baked in) for Eyes to read
  - `ChatPanel` — streaming message list with Stop button; renders math via KaTeX
- Design tokens in `src/portal/src/theme.js` — kid-friendly colors, encouraging tone in copy, large legible fonts
- Vite dev server proxies API/WebSocket to Fastify backend

## Security & Safety

- **Kid-safe content**: tutor system prompt explicitly forbids off-topic chat, profanity, and unsafe advice; refuses anything unrelated to homework
- **No PII in prompts**: don't pass student names into the LLM; refer to them as "the student"
- **Image privacy**: uploaded photos stored in S3 with private ACL; signed URLs only; auto-delete after N days (configurable)
- **Auth**: JWT-based
- **Admin approval gate**: all new users require admin approval before they can use the tutor (MVP — replace with email verification later)

## Key Files

```
src/
  api/                          # Backend
    server.js                   # Fastify setup, plugin registration, route wiring
    routes/                     # One controller per file (filename = exported function name)
      healthcheck.js
      tutorCreateSession.js     # POST /api/tutor/session
      tutorGetMessages.js       # GET  /api/tutor/:sessionId/messages
      tutorSendMessage.js       # POST /api/tutor/:sessionId/message  (streams; runs Brain tool-call loop)
    lib/
      agentChat.js              # OpenAI-compatible streaming chat client (Brain)
      askVision.js              # Qwen2.5-VL Q&A (one image + one question)
      brainTools.js             # Tool defs: lookup_on_image, draw_annotation
      tutorPrompt.js            # Persona + per-turn system messages
      persistImage.js           # Disk (dev) image storage
      loadImageDataUrl.js       # Re-hydrate persisted image bytes for later vision calls
      hashBuffer.js             # sha256 helper for content-hash dedup
    db/
      schema.js                 # Drizzle schema
      index.js                  # postgres.js connection
    drizzle.config.js
    drizzle/                    # Generated SQL migrations
  portal/                       # Frontend (Vite + React)
    src/
      App.jsx                   # Root with routing
      theme.js                  # Design tokens
      pages/
        HomePage.jsx
        LoginPage.jsx
        TutorPage.jsx
        AdminPage.jsx
      components/
        PhotoCapture.jsx
        AnnotationCanvas.jsx    # Konva.js canvas
        ChatPanel.jsx
        VisionSummary.jsx
    vite.config.js
    package.json
devops/                         # Dockerfile + entrypoint
deploy/                         # AWS CDK app
dist/                           # Build artifacts (gitignored)
```

## Deployment

- **Domain**: `yoututorai.techseeding.com.au` (or chosen domain)
- **Target**: AWS `ap-southeast-2` — ECS Fargate behind ALB, Aurora Postgres Serverless v2, S3 for images, ECR for image, Secrets Manager, Route53 alias
- **IaC**: AWS CDK v2 (JavaScript) under `deploy/`
- **CI/CD**: GitHub Actions, push to `main` deploys via OIDC
- **AWS profile**: dedicated profile (e.g. `yoututorai`) for local deploy commands
