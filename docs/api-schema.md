# YouTutorAI API Schema

Fastify HTTP API. All routes are prefixed with `/api` except `/healthcheck`. Auth via JWT (`Authorization: Bearer <token>`) where noted.

## Public

### `GET /healthcheck`
Liveness probe. Returns `200 { ok: true }`. No auth.

## Admin *(planned)*

### `POST /api/admin/user`
Create a user directly (bypasses login request flow). Admin-only.

**Body**: `{ name: string, role: "student" | "parent" | "teacher" | "admin" }`
**Returns**: `{ userId: string }`

## Auth / Google SSO

### `POST /api/auth/google`
Verify a Google Identity Services ID token (`credential`), upsert the `user` row, and return a YTAI JWT. The token is verified via Google's `https://oauth2.googleapis.com/tokeninfo` endpoint — issuer, audience, and email-verification claims are all checked. Existing local accounts are linked when the email matches; otherwise a new row is inserted with `auth_provider='google'` and `status='pending'` (admin approval still required).

**Body**:
```json
{
  "credential": "<google_id_token>",
  "role": "student" | "parent" | "teacher"
}
```
`role` is honoured only on first sign-in for a brand-new account; existing users keep their stored role.

**Returns**:
```json
{
  "token": "<ytai_jwt>",
  "user": {
    "id": "uuid",
    "name": "string",
    "role": "student" | "parent" | "teacher" | "admin",
    "status": "pending" | "approved" | "rejected",
    "email": "string | null",
    "picture": "string | null"
  }
}
```

**Errors**:
- `400` — missing `credential`
- `401` — invalid / expired / audience-mismatched Google token
- `503` — `YTAI_GOOGLE_CLIENT_ID` is unset on the server

## Tutor

### `POST /api/tutor/session`
Start a new tutoring session. (Currently dev-mode: bootstraps a `dev` user automatically.)

**Returns**: `{ sessionId: string }`

### `GET /api/tutor/:sessionId/messages`
Fetch the full transcript for a session, ordered by `created_at`.

**Returns**:
```json
{
  "messages": [
    {
      "id": "...",
      "role": "user" | "assistant",
      "content": "...",
      "interrupted": false,
      "toolCalls": [{ "id": "...", "name": "draw_annotation", "args": { ... } }] | null,
      "createdAt": "..."
    }
  ]
}
```

`toolCalls` contains only **user-visible** tool calls (e.g. `draw_annotation`) so the client can re-render past AI annotations on the canvas. Internal `lookup_on_image` calls are not surfaced here.

### `POST /api/tutor/:sessionId/message`
Send a chat message. The server runs Brain (deepseek-v4-flash) in a tool-call loop with three tools:
- `find_text_on_image(query)` — string match against the EasyOCR result in `image_ocr.lines`; returns up to 5 matches + a union bbox, or a status of `no-match | pending | failed | unavailable`. Cheap and deterministic — no model call.
- `lookup_on_image(question)` — runs Qwen2.5-VL on the current image bytes; cached in `vision_extraction` per `(image_id, sha256(question))`.
- `draw_annotation(shape, x1, y1, x2, y2, color?)` — server snaps the bbox to the OCR line union (`snapAnnotationBbox`) and forwards it over SSE for Konva to render.

**Body**:
```json
{
  "content": "string",
  "image": {
    "dataUrl": "data:image/png;base64,...",
    "width": 1200,
    "height": 1600,
    "hasAnnotations": true
  }
}
```
- `image` is optional. The client only sends it when the canvas bytes have changed since the previous turn (hash dedup). If omitted, the server reuses `tutor_session.current_image_id` from a prior turn.
- Strokes are baked into `dataUrl` — the server does not need separate stroke geometry.

**Response**: `text/event-stream`.

Event types:
```
event: user
data: { "id": "<msgId>", "role": "user", "content": "...", "createdAt": "..." }

event: token
data: { "delta": "Sure! " }

event: lookup-start
data: { "id": "<toolCallId>", "question": "Where is question 3?" }
# For find_text_on_image, `question` is rendered as `find: "<query>"`.

event: lookup
data: { "id": "<toolCallId>", "question": "Where is question 3?",
        "result": { "answer": "...", "bbox": [0.70, 0.05, 0.95, 0.15] } }
# For find_text_on_image, `result` is { status, matches[], unionBbox? } —
# see findTextOnImage.js. Bboxes are corner format [x1, y1, x2, y2] in 0..1.

event: tool
data: { "id": "<toolCallId>", "name": "draw_annotation",
        "args": { "shape": "highlight", "x1": 0.70, "y1": 0.05, "x2": 0.95, "y2": 0.15 } }
# The server has already snapped the bbox to the OCR line union by the
# time the client sees this. shape ∈ { highlight (default), circle, rect }.

event: error
data: { "error": "..." }

event: done
data: { "messageId": "...", "promptTokens": 412, "completionTokens": 187, "interrupted": false, "toolCalls": [...], "createdAt": "..." }
```

- `lookup-start` lets the client show a "looking at the page…" indicator without waiting for the result; `lookup` carries the actual answer.
- `tool` events for `draw_annotation` should be rendered on the canvas. Bboxes are normalized 0..1 corners (`x1,y1` top-left + `x2,y2` bottom-right).
- Closing the stream from the client triggers `AbortController`, which interrupts both Brain and any in-flight vision call. The partial assistant message is persisted with `interrupted=true`.

### `GET /api/tutor/:sessionId/report`
Lazy-generated post-session report. First call (or any call after new messages have been appended) generates / incrementally refreshes the report.

**Query**: `?force=1` rebuilds from scratch instead of incrementally merging.

**Returns**:
```json
{
  "status": "ready",
  "summary": "Two or three sentences for an adult reader.",
  "questions": [
    {
      "question": "...", "studentAnswer": "...", "correctAnswer": "...",
      "correct": true, "mistakeType": null, "mistakeNotes": "",
      "nswOutcomeCode": "MA2-MR-01", "nswOutcomeText": "...",
      "nswStrand": "...", "nswFocusArea": "...", "nswStage": "Stage 2", "nswSubject": "Mathematics"
    }
  ],
  "modelVersion": "deepseek/deepseek-chat"
}
```

Staleness: persisted reports carry a `cursor_message_id`. If new `session_message` rows exist for this session after the cursor, the next GET refreshes the report — incrementally if the prior questions list is valid, otherwise from scratch. Because `session_message` is append-only and immutable, the cursor never needs invalidation from edits.

## Me (cross-session views)

### `GET /api/me/subject-reports`
List every subject-level report (any status) for the current user, newest `created_at` first. Drives the Reports page — a scrollable history of every report the user has generated. Pending and failed rows are included so the UI can render in-progress and error states without a separate endpoint.

**Returns**:
```json
{
  "reports": [
    {
      "id": "uuid", "subject": "math",
      "status": "ready" | "pending" | "failed",
      "narrative": "string", "content": { "title": "string", "narrative": "string", "sections": [...] },
      "customPrompt": "string",
      "generatedAt": "...", "includedSessions": [{ "sessionId": "...", "cursorMessageId": "..." }],
      "error": null,
      "createdAt": "...", "updatedAt": "..."
    }
  ]
}
```

While `status` is `pending`, `content` may briefly be `null` (during the very first second) or `{ title: "..." }` (after the parallel pre-title call lands) — the UI uses `content.title` as the display name and falls back to a placeholder until it appears.

### `POST /api/me/subject-report`
Generate a new subject-level report. **Every call inserts a new immutable row** — past reports stay around as a browsable history; there is no in-place refresh. Returns immediately with a `pending` row; the actual rollup runs in a background task. The client picks the row up via `GET /api/me/subject-reports` and polls until it transitions to `ready` or `failed`.

**Body**:
```json
{
  "subject": "math" | "thinking" | "reading" | "writing",
  "prompt": "string (required, max 2000 chars)"
}
```

**Returns**:
```json
{
  "id": "uuid",
  "status": "pending" | "empty",
  "subject": "math",
  "customPrompt": "the normalised prompt",
  "createdAt": "..."
}
```

`status: "empty"` is returned when the user has no sessions for the requested subject yet (no row is inserted and no LLM call is made).

The eventual `content` shape on a `ready` row is `{ title, narrative, sections?: [{ title, bullets[] }] }` — `title` is a short LLM-generated report name, `narrative` is the full body in markdown, and `sections` is an optional list of structured bullet cards the UI renders alongside the narrative.

**Errors**:
- `400` — invalid `subject`, missing/too-long `prompt`
- `502` — LLM call failed

### `DELETE /api/me/subject-report/:id`
Delete a single report belonging to the current user. Returns `{ ok: true }` on success, `404` if the row does not exist (or is owned by another user).

## WebSocket *(deferred)*

### `WS /api/ws`
Reserved for voice in/out (v2) or multi-user shared sessions (v2). MVP uses SSE only.
