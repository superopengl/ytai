# YouTutorAI Architecture

## AI Pipeline — The Eyes/Brain Split

Cost-optimized two-model pipeline. Vision is expensive; chat is cheap. We minimize vision calls.

```
[Photo upload]
     │
     ▼
DeepSeek-VL2 (Eyes) ── runs ONCE on upload
     │   Returns: { questions: [...], marked_answers: [...], notes: [...] }
     ▼
[Stored on session as structured context]
     │
     ▼
DeepSeek-V3.2 (Brain) ── runs on EVERY chat turn
     │   System prompt includes the structured page context + tutoring persona
     │   Streams response to client; abortable
     ▼
[Student replies / asks follow-up]
     │
     ├── Text-only follow-up? → Brain only (cheap)
     │
     └── "Circle something new" button pressed?
              │
              ▼
         Crop image to drawn coordinates (client-side, via Konva)
              │
              ▼
         DeepSeek-VL2 on the crop only ── returns text in that region
              │
              ▼
         Append to chat context, then Brain generates response
```

**Key rules**:
- Vision (VL2) runs only on (a) initial upload, (b) explicit "circle something new" action. Never on every turn.
- The text model is given the structured JSON from the initial vision pass as part of its system context — it can reference questions by number without re-querying VL2.
- If VL2 confidence is low on a circle, fall back to the client-side coordinate crop. This bypasses the detection problem entirely.
- Streaming chat uses `AbortController` so the **Stop** button can interrupt mid-response. The interrupted partial response is preserved in the transcript so follow-ups have context.

## Cost / Model Strategy

- **VL2 (Eyes)** is the expensive call. Strategy: run it **at most twice per question** — once on upload, once if the user circles a new region. Cache results in `vision_extraction` keyed by image + region hash so re-circling the same area is free.
- **V3.2 (Brain)** runs every chat turn. ~10-20× cheaper than Claude Sonnet, so multi-turn back-and-forth tutoring stays affordable.
- **Confidence fallback**: if VL2 returns low confidence on a circle, skip VL2 and send the client-side cropped image region directly to V3.2 with a "what does this say?" prompt. V3.2 is text-only, so this fallback requires the multimodal variant or routing to VL2 anyway — TBD during build, may need to keep VL2 as the only OCR path.
- **Watch-outs**:
  - DeepSeek model names change. Verify `deepseek-vl2` and the latest V3.x text model on deepseek.com/api before wiring the client.
  - DeepSeek's pedagogy is weaker than Claude on Socratic teaching for young kids. Compensate with a strong system prompt: "Never give the answer directly. Ask one guiding question at a time. Use language an 8-year-old understands."

## Frontend (React + Ant Design)

- React 19 + Ant Design 6, bundled via Vite
- Routing via react-router-dom v7
- Source in `src/portal/src/`, builds to `dist/public/` (served by Fastify in production)
- Pages: `HomePage`, `LoginPage`, `TutorPage`, `AdminPage`
- Components:
  - `PhotoCapture` — `<input type="file" capture="environment">` for phone camera + upload fallback
  - `AnnotationCanvas` — Konva.js wrapper; renders the photo as a background layer and a transparent drawing layer on top; exposes `getCircledRegion()` returning a crop blob + bounding box
  - `ChatPanel` — streaming message list with Stop button; renders math via KaTeX
  - `VisionSummary` — shows the structured page extraction (questions, marked answers) above chat, collapsible
- Design tokens in `src/portal/src/theme.js` — kid-friendly colors, encouraging tone in copy, large legible fonts
- Vite dev server proxies API/WebSocket to Fastify backend

## Security & Safety

- **Kid-safe content**: tutor system prompt explicitly forbids off-topic chat, profanity, and unsafe advice; refuses anything unrelated to homework
- **No PII in prompts**: don't pass student names into the LLM; refer to them as "the student"
- **Image privacy**: uploaded photos stored in S3 with private ACL; signed URLs only; auto-delete after N days (configurable)
- **Auth**: JWT-based, same pattern as KidPlayAI
- **Admin approval gate**: all new users require admin approval before they can use the tutor (MVP — replace with email verification later)

## Key Files

```
src/
  api/                          # Backend
    server.js                   # Fastify setup, plugin registration, route wiring
    routes/                     # One controller per file (filename = exported function name)
      healthcheck.js
      login.js                  # POST /api/login/user
      loginStatus.js            # GET /api/login/:loginRequestId/status
      adminUsers.js
      adminCreateUser.js
      tutorCreateSession.js     # POST /api/tutor/session
      tutorUploadImage.js       # POST /api/tutor/:sessionId/image
      tutorCircleRegion.js      # POST /api/tutor/:sessionId/circle
      tutorSendMessage.js       # POST /api/tutor/:sessionId/message  (streams)
      tutorGetSession.js        # GET /api/tutor/:sessionId
    lib/
      deepseekVision.js         # DeepSeek-VL2 client (full-page + crop modes)
      deepseekChat.js           # DeepSeek-V3.2 client with streaming + abort
      tutorPrompt.js            # System prompt builder for the tutor persona
      imageStorage.js           # S3 (prod) / local disk (dev) abstraction
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
deploy/                         # AWS CDK app (mirror kpai structure)
dist/                           # Build artifacts (gitignored)
```

## Deployment (Planned, mirrors KidPlayAI)

- **Domain**: `yoututorai.techseeding.com.au` (or chosen domain)
- **Target**: AWS `ap-southeast-2` — ECS Fargate behind ALB, Aurora Postgres Serverless v2, S3 for images, ECR for image, Secrets Manager, Route53 alias
- **IaC**: AWS CDK v2 (JavaScript) under `deploy/`
- **CI/CD**: GitHub Actions, push to `main` deploys via OIDC
- **AWS profile**: dedicated profile (e.g. `yoututorai`) for local deploy commands
