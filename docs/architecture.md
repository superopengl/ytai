# YouTutorAI Architecture

## AI Pipeline — single multimodal Brain

A single multimodal LLM ("Brain") handles chat, reading, and visual reasoning in one call. Each turn attaches every page of the active doc to the user message as an `image_url` block; Brain reads the printed text, the student's handwriting, diagrams, and any freehand marks directly.

- **Brain** — any OpenAI-compatible multimodal model. Default dev: `google/gemma-4-e4b` via LM Studio (`http://localhost:9529/v1`). Prod: any multimodal model on OpenRouter (Gemma 4, Gemini 2.5, GPT-4o, etc.).

```
[Photo upload + freehand strokes on canvas]
     │
     ▼
Frontend flattens Konva stage → PNG (strokes baked in)
     │
     ▼
POST /api/tutor/:sessionId/doc       — stores pages in session_doc + session_image
POST /api/tutor/:sessionId/message   — student's question + optional per-turn
                                       annotated-canvas snapshot
     │
     ▼
Server builds the latest user message as a multimodal content array:
     {type: 'text', text: 'Worksheet (page N of M):'},
     {type: 'image_url', image_url: {url: data:image/png;base64,...}},
     ... (one image_url per page; annotated-canvas bytes used when present)
     {type: 'text', text: <student message>}
     │
     ▼
Brain streams tokens + (optional) tool_call: draw_annotation(shape,page,x1,y1,x2,y2,color?,label?)
     │
     ▼
Server emits SSE:
     event: token       — text deltas to the chat panel
     event: tool        — draw_annotation payload to the canvas
     event: done        — final usage + assistantMessage id
```

**Key rules**:
- The latest user message carries page images every turn. Prior turns stay text-only in conversation history — Brain sees the worksheet fresh each turn; old assistant replies are just text descriptions of what was seen.
- The student's freehand strokes are baked into the page image bytes (the canvas exports the flattened Konva stage), so Brain reads circles, underlines, and highlights as part of the page — no separate coordinate-mapping pass.
- `draw_annotation` is the only tool. Brain estimates the bbox itself from what it sees in the image; the server validates corners, assigns a fresh palette color, and forwards the call over SSE.
- Brain's tool-call loop is capped at `MAX_TOOL_ROUNDS = 10` per turn as a runaway guard.
- Streaming uses SSE + `AbortController` so the Stop button kills Brain mid-stream. The interrupted partial response is preserved in the transcript.
- A hallucination guard (regex over the assistant content) logs warnings when Brain narrates a highlight without actually calling `draw_annotation`.

## Reporting — two-tier rollup

A separate, off-turn pipeline produces parent/teacher-facing reports from the same session data. Two layers, both lazy and cached:

```
session_message (append-only, immutable)
        │
        ▼
session_report (1 per session)
   structured questions[] + summary
   cursor_message_id → last folded message
        │   incremental refresh:
        │   load messages strictly after cursor,
        │   ask LLM to merge prior questions[] with new transcript.
        │
        ▼
subject_report (N per (user, subject), immutable once generated)
   Every report is the same shape — subject + user prompt → LLM-generated
   { title, narrative, sections? }. The frontend offers prompt templates
   ("Wrong Answer Journal", "Strengths & Weaknesses", "Curriculum Map")
   that prefill the textarea; the backend never sees these as types.
   Each generation request inserts a fresh row carrying its own
   created_at. Past reports stay around as a browsable history.
   included_sessions[] is an audit trail of which session reports were
   folded in. A title-only LLM call runs in parallel with the session
   refresh so the polling UI shows the real report name within seconds.
```

Because `session_message` is append-only and immutable, the cursor is a simple `last_message_id` FK — no content-hash invalidation, no edit detection. Subject-report rollups feed the LLM the *structured* session data (`questions[]` + summaries), never raw transcripts — this keeps cost bounded and is also the safety boundary for user-supplied prompts.

The Reports portal page (`/reports`) shows a `subjects × builtin types` grid plus a custom-prompt input.

## Cost / Model Strategy

- One multimodal call per turn replaces the previous Brain+Eyes+OCR pipeline. Image tokens are paid per turn since the page bytes attach to the latest user message — multi-page worksheets compound this, watch context size.
- In dev, LM Studio + Gemma 4 e4b means inference is free per-token (local CPU/GPU). In prod the bill is one chat-completion per turn at whichever multimodal model is configured.
- No per-question cache: Brain re-reads the image every turn. Cheaper to lean on the model's own KV-cache where the provider supports it than to maintain a separate vision cache.

## Frontend (React + Ant Design)

- React 19 + Ant Design 6, bundled via Vite
- Routing via react-router-dom v7
- Source in `src/portal/src/`, builds to `dist/public/` (served by Fastify in production)
- Pages: `HomePage` (which is also the sign-in surface — Google SSO only), `TutorPage`, `AdminPage`, plus public utility pages `PrivacyPolicyPage`, `TermsOfUsePage`, `LogoPage`
- Components:
  - `PhotoCapture` — `<input type="file" capture="environment">` for phone camera + upload fallback
  - `AnnotationCanvas` — Konva.js wrapper; renders the photo as a background layer and a transparent drawing layer on top; `exportImage()` returns a flattened dataUrl (strokes baked in) for Brain to read
  - `ChatPanel` — streaming message list with Stop button; renders math via KaTeX
- Design tokens in `src/portal/src/theme.js` — kid-friendly colors, encouraging tone in copy, large legible fonts
- Vite dev server proxies API/WebSocket to Fastify backend

## Security & Safety

- **Kid-safe content**: tutor system prompt explicitly forbids off-topic chat, profanity, and unsafe advice; refuses anything unrelated to homework
- **No PII in prompts**: don't pass student names into the LLM; refer to them as "the student"
- **Image privacy**: uploaded photos stored in S3 with private ACL; signed URLs only; auto-delete after N days (configurable)
- **Auth**: JWT-based

## Key Files

```
src/
  api/                          # Backend
    server.js                   # Fastify setup, plugin registration, route wiring
    routes/                     # One controller per file (filename = exported function name)
      healthcheck.js
      tutorCreateSession.js     # POST /api/tutor/session
      tutorCreateDoc.js         # POST /api/tutor/:sessionId/doc
      tutorGetMessages.js       # GET  /api/tutor/:sessionId/messages
      tutorSendMessage.js       # POST /api/tutor/:sessionId/message  (streams; runs Brain tool-call loop)
    lib/
      agentChat.js              # OpenAI-compatible streaming chat client
      brainTools.js             # Tool def: draw_annotation
      buildUserMessageWithImages.js  # Builds the multimodal user content array
      makeTutorTools.js         # Dispatch for draw_annotation (validates bbox, assigns palette color)
      runBrainTurn.js           # Per-turn loop (streams chat, accumulates tool calls, dispatches)
      tutorPrompt.js            # Persona + per-turn system messages
      persistImage.js           # S3 / disk image storage
      loadImageDataUrl.js       # Re-hydrate persisted image bytes as data URL
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
        TutorPage.jsx
        AdminPage.jsx
        PrivacyPolicyPage.jsx
        TermsOfUsePage.jsx
        LogoPage.jsx
      components/
        PhotoCapture.jsx
        AnnotationCanvas.jsx    # Konva.js canvas
        ChatPanel.jsx
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
