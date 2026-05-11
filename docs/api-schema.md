# YouTutorAI API Schema

Fastify HTTP API. All routes are prefixed with `/api` except `/healthcheck`. Auth via JWT (`Authorization: Bearer <token>`) where noted.

## Public

### `GET /healthcheck`
Liveness probe. Returns `200 { ok: true }`. No auth.

## Auth / Login *(planned)*

### `POST /api/login/user`
Submit a login request. Creates a `user` (if new name+role combination) and a `login_request` with status `pending`.

**Body**: `{ name: string, role: "student" | "parent" | "teacher" }`
**Returns**: `{ loginRequestId: string }`

### `GET /api/login/:loginRequestId/status`
Poll the status of a login request. The login page polls this until status flips to `approved` or `rejected`.

**Returns**: `{ status: "pending" | "approved" | "rejected", userId: string | null, token: string | null }`

When `approved`, the response includes a JWT in `token` for subsequent authenticated calls.

## Admin *(planned)*

### `POST /api/admin/user`
Create a user directly (bypasses login request flow). Admin-only.

**Body**: `{ name: string, role: "student" | "parent" | "teacher" | "admin" }`
**Returns**: `{ userId: string }`

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
Send a chat message. The server runs Brain (deepseek-v4-flash) in a tool-call loop: when Brain calls `lookup_on_image`, the server runs Qwen2.5-VL on the current image bytes and feeds the result back; when Brain calls `draw_annotation`, the server forwards it over SSE to the client.

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

event: lookup
data: { "id": "<toolCallId>", "question": "Where is question 3?", "result": { "answer": "...", "bbox": [0.7, 0.05, 0.25, 0.1] } }

event: tool
data: { "id": "<toolCallId>", "name": "draw_annotation", "args": { "shape": "rect", "x": 0.7, "y": 0.05, "width": 0.25, "height": 0.1 } }

event: error
data: { "error": "..." }

event: done
data: { "messageId": "...", "promptTokens": 412, "completionTokens": 187, "interrupted": false, "toolCalls": [...], "createdAt": "..." }
```

- `lookup` events are informational — the client can show a "looking at the page…" indicator but does not need to act on them.
- `tool` events for `draw_annotation` should be rendered on the canvas.
- Closing the stream from the client triggers `AbortController`, which interrupts both Brain and any in-flight vision call. The partial assistant message is persisted with `interrupted=true`.

## WebSocket *(deferred)*

### `WS /api/ws`
Reserved for voice in/out (v2) or multi-user shared sessions (v2). MVP uses SSE only.
