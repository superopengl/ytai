# YouTutorAI API Schema

Fastify HTTP API. All routes are prefixed with `/api` except `/healthcheck`. Auth via JWT (`Authorization: Bearer <token>`) where noted.

## Public

### `GET /healthcheck`
Liveness probe. Returns `200 { ok: true }`. No auth.

## Admin

Every `/api/admin/*` route requires a YTAI JWT whose `role` claim is `admin`. The global `onRequest` hook in `server.js` rejects everything else with `403 Forbidden` before the handler runs, so individual admin routes never need to re-check the role.

### `GET /api/admin/users`
List every real user — Google sign-ups, email OTP sign-ups, and any other admins — newest `created_at` first. The bootstrap admin (`auth_provider='local'` with a `local_login_user_name` set) is filtered out so the dashboard isn't cluttered with the machine-managed login handle.

**Returns**:
```json
{
  "users": [
    {
      "id": "uuid",
      "name": "string",
      "role": "student" | "parent" | "teacher" | "admin",
      "authProvider": "google" | "email" | "local",
      "email": "string | null",
      "picture": "string | null",
      "userName": "string | null",
      "createdAt": "<iso8601>",
      "updatedAt": "<iso8601>"
    }
  ]
}
```

**Errors**:
- `401` — missing / invalid JWT
- `403` — JWT's `role` claim is not `admin`

### `POST /api/admin/password`
Change the signed-in admin's password. Verifies `currentPassword` against the stored scrypt hash, then writes a freshly hashed `newPassword`. The route is admin-only by virtue of the global `/api/admin/*` gate — the JWT's `sub` identifies which admin row to update.

**Body**: `{ "currentPassword": "string", "newPassword": "string" }` (`newPassword` min length 8)

**Returns**: `{ "ok": true }`

**Errors**:
- `400` — missing fields or `newPassword` shorter than 8 characters
- `401` — `currentPassword` doesn't match the stored hash
- `403` — JWT's `role` claim is not `admin`, or the user row no longer has a password hash

**Note**: `bootstrapAdmin` re-asserts the password from `YTAI_ADMIN_PASSWORD` on every server start, so a change made here is reverted on next restart unless the env var is updated too.

### `POST /api/admin/user` *(planned)*
Create a user directly (bypasses login request flow). Admin-only.

**Body**: `{ name: string, role: "student" | "parent" | "teacher" | "admin" }`
**Returns**: `{ userId: string }`

### `DELETE /api/admin/user/:id/data`
Wipe every content row tied to a student account: every `tutor_session` and the cascade beneath it (`session_doc`, `session_image`, `session_message`, `session_report`) and every `subject_report` the student authored. The `user` row itself is kept so the student can sign back in to a fresh slate. `login_otp` (short-lived auth state) and `tts_audio` (cross-user TTS cache) are deliberately untouched. `llm_usage` is also preserved — it's the per-call billing audit log and must outlive the entities it references; its FK columns are plain UUIDs and become orphans on wipe, which is fine since the token-usage aggregates filter on `user_id` (kept). S3 objects are not deleted by this call — the `<prefix>/images/` lifecycle rule on `YTAI_S3_BUCKET` reclaims them automatically.

The whole wipe runs in a single transaction so partial deletes can't leave dangling rows. Restricted to `role='student'` — calling it on an admin/parent/teacher returns `409` and does nothing.

**Returns**:
```json
{
  "ok": true,
  "deleted": {
    "sessions": 7,
    "images": 23,
    "subjectReports": 2
  }
}
```

**Errors**:
- `400` — missing `:id`
- `401` — missing / invalid JWT
- `403` — JWT's `role` claim is not `admin`
- `404` — no user with that id
- `409` — user exists but `role != 'student'`

### `GET /api/admin/user/:id/token-usage`
Per-day token + cost aggregates pulled from `llm_usage` for one user. The response is the raw `(date, purpose, model)` grid — the frontend reshapes it into a stacked column chart split by either `purpose` or `model` without re-querying. Uses `llm_usage` directly (the per-call source of truth) rather than the rollup on `session_message`, so totals match billing.

**Returns**:
```json
{
  "user": { "id": "uuid", "name": "string", "role": "student" | "parent" | "teacher" | "admin" },
  "days": [
    {
      "date": "2026-05-27",
      "purpose": "brain_chat" | "session_report" | "subject_report" | "subject_report_title",
      "model": "google/gemma-4-e4b",
      "inputTokens": 1234,
      "outputTokens": 567,
      "reasoningTokens": 0,
      "cacheReadTokens": 0,
      "cacheWriteTokens": 0,
      "totalTokens": 1801,
      "costUsd": 0.0123,
      "calls": 3
    }
  ]
}
```

`days` is empty when the user has no recorded calls. Dates are UTC-day-bucketed via `date_trunc('day', created_at)`. Historical rows from before the unified-vision cleanup may still carry `purpose='vision_lookup'`; new rows do not.

**Errors**:
- `400` — missing `:id`
- `401` — missing / invalid JWT
- `403` — JWT's `role` claim is not `admin`
- `404` — no user with that id

## Auth

Three sign-in paths, all returning the same `{ token, user }` shape:

| Path | Audience | Notes |
|---|---|---|
| `POST /api/auth/google` | Anyone with a Google account | One-tap GIS popup; always preferred |
| `POST /api/auth/email` + `POST /api/auth/otp` | Anyone with an email | Two-step: request a 6-digit code, then verify it |
| `POST /api/auth/password` | Admins only | Username + password fallback for when Google/email are down |

All four endpoints sit under `/api/auth/*` so the global JWT hook lets them through unauthenticated.

### `POST /api/auth/google`
Verify a Google Identity Services ID token (`credential`), upsert the `user` row, and return a YTAI JWT. The token is verified via Google's `https://oauth2.googleapis.com/tokeninfo` endpoint — issuer, audience, and email-verification claims are all checked. Existing local accounts are linked when the email matches; otherwise a new row is inserted with `auth_provider='google'`.

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
    "email": "string | null",
    "picture": "string | null"
  }
}
```

**Errors**:
- `400` — missing `credential`
- `401` — invalid / expired / audience-mismatched Google token
- `503` — `YTAI_GOOGLE_CLIENT_ID` is unset on the server

### `POST /api/auth/email`
Issue a 6-digit OTP for the given email and (best-effort) send it via AWS SES. The OTP row is stored in plain text so an operator can read it back when email delivery is broken (logs always carry the code). If the email is unknown, a new user is auto-created with `auth_provider='email'`. Resending within a 30 s window reuses the live row so a kid mashing the button doesn't fan out into a dozen valid codes.

**Body**: `{ "email": "string" }`

**Returns**: `{ "expiresAt": "<iso8601>" }` — when the issued code stops being valid.

**Errors**:
- `400` — missing / malformed email

### `POST /api/auth/otp`
Verify the 6-digit code against the latest unconsumed OTP for the email. Wrong attempts increment a counter; after 5 the row is burned and the user has to request a fresh code. On success the row is deleted (no replay) and a 30-day YTAI JWT is returned. Response shape matches `/api/auth/google`.

**Body**: `{ "email": "string", "code": "string" }` (`code` must be exactly 6 digits)

**Returns**: same `{ token, user }` shape as `/api/auth/google`.

**Errors**:
- `400` — missing / malformed email or code
- `401` — code didn't match the stored row
- `404` — no active OTP for this email
- `410` — code expired (request a fresh one)
- `429` — too many wrong attempts on this code

### `POST /api/auth/password`
Admin-only username + password sign-in. Every other auth path is passwordless; this one exists so an operator can sign in even when Google or email delivery is down. Only users with `role='admin'` and a non-null `password_hash` can authenticate here — every other failure mode (missing user, wrong password, non-admin role) returns the same generic 401 so we don't leak which case fired. Passwords are stored as scrypt hashes (`scrypt$<saltHex>$<keyHex>`); plain-text passwords are never persisted.

**Body**: `{ "userName": "string", "password": "string" }`

**Returns**: same `{ token, user }` shape as `/api/auth/google`.

**Errors**:
- `400` — missing username or password
- `401` — invalid username or password (covers every failure mode)

**Bootstrap**: On every server start, `bootstrapAdmin` ensures at least one admin user exists. It honours `YTAI_ADMIN_USERNAME` / `YTAI_ADMIN_PASSWORD` if both are set, otherwise falls back to the hardcoded default `admin` / `adminadmin`. The default exists so a fresh checkout has a working admin sign-in without any extra setup — change the env vars (or the row) for any non-dev deployment.

## Tutor

### `POST /api/tutor/session`
Start a new tutoring session. (Currently dev-mode: bootstraps a `dev` user automatically.)

**Returns**: `{ sessionId: string }`

### `PATCH /api/tutor/:sessionId`
Update mutable fields on an existing session. Each field is optional — send any subset and the rest stay untouched — but at least one must be present. Used by the Tutor page to switch guidance levels, change subject, set the active doc, or rename the session.

**Body** (any combination, at least one required):
```json
{
  "guidanceLevel": "<one of GUIDANCE_LEVELS>",
  "subject": "math" | "thinking" | "reading" | "writing",
  "currentDocId": "<doc uuid owned by this session>" | null,
  "title": "string (1..80 chars)" | null
}
```
`currentDocId: null` clears the active doc. When a UUID is provided, the route verifies the doc belongs to this session — passing another session's doc returns `404`. `title` is trimmed; `null` or an all-whitespace string clears it back to the auto-generated first-message preview; anything > 80 chars after trimming is `400`.

**Returns**:
```json
{
  "sessionId": "uuid",
  "guidanceLevel": "...",
  "subject": "...",
  "currentDocId": "uuid | null",
  "title": "string | null"
}
```

**Errors**:
- `400` — none of the patchable fields present, or an invalid enum / id shape
- `404` — session not found for this user, or `currentDocId` doesn't belong to this session
- `401` — missing / invalid JWT

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

`toolCalls` contains the user-visible `draw_annotation` audit trail so the client can re-render past AI annotations on the canvas.

### `POST /api/tutor/:sessionId/message`
Send a chat message. The server builds a multimodal user message — every page of the session's active doc is attached as an `image_url` block, followed by the student's text — and runs Brain (the configured multimodal model) in a tool-call loop. The only tool exposed is `draw_annotation`.

- `draw_annotation(shape, page, x1, y1, x2, y2, color?, label?)` — Brain emits a normalized 0..1 bbox from its own visual estimation; the server validates corners, assigns a fresh palette color, and forwards the call over SSE for Konva to render.

**Body**:
```json
{
  "content": "string",
  "viewingPage": 1,
  "annotatedImage": {
    "imageId": "<session_image.id of the page the student drew on this turn>",
    "dataUrl": "data:image/png;base64,..."
  }
}
```
- `viewingPage` (optional) tells Brain which page the student is currently looking at so it biases attention toward that page.
- `annotatedImage` (optional) is a per-turn snapshot of the student's freehand canvas. When present, its bytes substitute for the original page so Brain sees the marks. Not persisted — it lives just for this turn.

**Response**: `text/event-stream`.

Event types:
```
event: user
data: { "id": "<msgId>", "role": "user", "content": "...", "createdAt": "..." }

event: token
data: { "delta": "Sure! " }

event: tool
data: { "id": "<toolCallId>", "name": "draw_annotation",
        "args": { "shape": "highlight", "page": 1, "imageId": "<session_image.id>",
                  "x1": 0.70, "y1": 0.05, "x2": 0.95, "y2": 0.15,
                  "color": "#fff59d", "colorName": "yellow", "label": "Question 3" } }
# shape ∈ { highlight (default), circle, rect }. Coordinates are normalized
# 0..1 corners within the named page.

event: error
data: { "error": "..." }

event: done
data: { "messageId": "...", "inputTokens": 412, "outputTokens": 187, "interrupted": false, "toolCalls": [...], "createdAt": "..." }
```

- `tool` events for `draw_annotation` should be rendered on the canvas. Bboxes are normalized 0..1 corners (`x1,y1` top-left + `x2,y2` bottom-right) within the page named by `imageId`.
- Closing the stream from the client triggers `AbortController`, which interrupts Brain's stream. The partial assistant message is persisted with `interrupted=true`.

## Analysis reports (cross-session views)

### `GET /api/analysis-reports`
List every analysis report (any status) for the current user, newest `created_at` first. Drives the Reports page — a scrollable history of every report the user has generated. Pending and failed rows are included so the UI can render in-progress and error states without a separate endpoint.

**Query**:
- `ids` (optional) — comma-separated list of report UUIDs (max 100). When provided, only those rows are returned (still scoped to the current user). The Reports page uses this to poll status flips on just the `pending` rows it already knows about, instead of refetching the entire history every tick.

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

### `POST /api/analysis-report`
Generate a new analysis report. **Every call inserts a new immutable row** — past reports stay around as a browsable history; there is no in-place refresh. Returns immediately with a `pending` row; the actual rollup runs in a background task. The client picks the row up via `GET /api/analysis-reports` and polls until it transitions to `ready` or `failed`.

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

### `DELETE /api/analysis-report/:id`
Delete a single report belonging to the current user. Returns `{ ok: true }` on success, `404` if the row does not exist (or is owned by another user).

## WebSocket *(deferred)*

### `WS /api/ws`
Reserved for voice in/out (v2) or multi-user shared sessions (v2). MVP uses SSE only.
