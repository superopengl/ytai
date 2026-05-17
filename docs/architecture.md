# YouTutorAI Architecture

## AI Pipeline — Brain drives, OCR-first then Eyes

Three-stage pipeline:
- **EasyOCR** ("OCR") — cheap, deterministic local sidecar that reads printed text on upload.
- **Qwen2.5-VL** ("Eyes") — semantic vision for handwriting, math, diagrams, and anything OCR can't see.
- **deepseek-v4-flash** ("Brain") — chat, runs every turn, decides which of the above to call.

Brain and Eyes go through OpenRouter; OCR runs as a local Docker sidecar (`devops/ocr/`, port 9531).

```
[Photo upload + freehand strokes on canvas]
     │
     ▼
Frontend flattens Konva stage → PNG (strokes baked in)
     │
     ▼
POST /api/tutor/:sessionId/message
     │   Dedup by sha256(bytes); persist to disk; record as
     │   tutor_session.current_image_id.
     │   Kick async EasyOCR job → writes lines to image_ocr.
     ▼
Brain (deepseek-v4-flash) on every chat turn
     │   System prompt = persona + "image attached, prefer find_text_on_image
     │   for known printed text, escalate to lookup_on_image otherwise"
     │   Tools = { find_text_on_image, lookup_on_image, draw_annotation }
     ▼
For each turn:
     ├─ tokens stream out                            ──► SSE to client
     ├─ tool_call: find_text_on_image(query)
     │         │
     │         ▼
     │    Server matches `query` against image_ocr.lines, returns
     │    up to 5 matches + unionBbox (corners 0..1). 'no-match' /
     │    'pending' / 'unavailable' tells Brain to fall back to Eyes.
     │
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

Tool: draw_annotation(shape, x1, y1, x2, y2, color?)
     │   Brain passes a corner bbox from a lookup. Server snaps it to
     │   the union of image_ocr lines that fall inside (so marks hug
     │   actual printed text), then forwards to the client over SSE.
     │   Konva renders shape only — no text label.
```

**Key rules**:
- OCR runs eagerly (async) but Eyes is on-demand. EasyOCR is cheap and deterministic so it's fine to pay once per image; the VLM is expensive enough to only call when Brain has a focused question.
- The bytes Eyes sees include the student's freehand strokes (the canvas exports the flattened stage). Eyes interprets circles, underlines, and highlights directly; the server never reasons about stroke coordinates. OCR sees the same bytes but ignores strokes — its job is reading printed page text.
- `image_ocr` is a per-image cache, keyed by `image_id` (one row per image, lifecycle `pending → ready/failed`). `vision_extraction` is a per-question cache. Changing annotations changes `image_id` and naturally invalidates both.
- `find_text_on_image` does plain string matching against OCR lines — no model call. Returns 'no-match' / 'pending' / 'failed' / 'unavailable' as signals for Brain to fall back to Eyes.
- `draw_annotation` bboxes are snapped to the OCR line union via `snapAnnotationBbox.js` before they hit the wire. No-op when OCR isn't ready or the supplied region is too large to be a single-phrase target.
- OCR is **optional** — when `YTAI_OCR_BASE_URL` is unset, `find_text_on_image` returns `unavailable`, the snap is a no-op, and Brain falls through to Eyes for everything.
- Brain's tool-call loop is capped at `MAX_TOOL_ROUNDS = 6` per turn as a runaway guard.
- Streaming uses SSE + `AbortController` so the Stop button kills both Brain and any in-flight Eyes call. The interrupted partial response is preserved in the transcript.

## Cost / Model Strategy

- **OCR (EasyOCR)** is free per-token at request time (runs locally, no per-call cost beyond CPU). Eagerly pre-runs once per image (~3–8s on CPU) so subsequent `find_text_on_image` calls hit a DB row, not the sidecar.
- **Eyes (Qwen2.5-VL)** is the expensive call. Strategy: run it only when OCR can't answer. Cache results in `vision_extraction` keyed by `(image_id, sha256(question))` so repeated lookups are free. Image-byte dedup means re-sending the same photo doesn't create a new image row.
- **Brain (deepseek-v4-flash)** runs every chat turn. Cheap. The tool-call loop may add 1–2 extra Brain round-trips per turn that needs vision, but Brain calls are still inexpensive vs Eyes.
- **Worst case per turn**: Brain → tool call → Eyes (1–3s) → Brain → tokens. Equivalent latency to the previous eager-extraction model on the first turn, *better* on text-only turns (no vision call at all) and on "locate question 3" turns that resolve through OCR alone.
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
      brainTools.js             # Tool defs: find_text_on_image, lookup_on_image, draw_annotation
      ensureImageOcr.js         # Async kick of the EasyOCR sidecar; writes image_ocr rows
      findTextOnImage.js        # String match against image_ocr.lines for find_text_on_image
      runOcr.js                 # HTTP client for the OCR sidecar
      snapAnnotationBbox.js     # Tightens draw_annotation bboxes to OCR line union
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
  ocr/                          # EasyOCR FastAPI sidecar (Dockerfile, server.py, requirements.txt)
deploy/                         # AWS CDK app
dist/                           # Build artifacts (gitignored)
```

## Deployment

- **Domain**: `yoututorai.techseeding.com.au` (or chosen domain)
- **Target**: AWS `ap-southeast-2` — ECS Fargate behind ALB, Aurora Postgres Serverless v2, S3 for images, ECR for image, Secrets Manager, Route53 alias
- **IaC**: AWS CDK v2 (JavaScript) under `deploy/`
- **CI/CD**: GitHub Actions, push to `main` deploys via OIDC
- **AWS profile**: dedicated profile (e.g. `yoututorai`) for local deploy commands
