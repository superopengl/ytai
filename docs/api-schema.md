# YouTutorAI API Schema

Fastify HTTP API. All routes are prefixed with `/api` except `/healthcheck`. Auth via JWT (`Authorization: Bearer <token>`) where noted.

## Public

### `GET /healthcheck`
Liveness probe. Returns `200 { ok: true }`. No auth.

## Auth / Login

### `POST /api/login/user`
Submit a login request. Creates a `user` (if new name+role combination) and a `login_request` with status `pending`.

**Body**: `{ name: string, role: "student" | "parent" | "teacher" }`
**Returns**: `{ loginRequestId: string }`

### `GET /api/login/:loginRequestId/status`
Poll the status of a login request. The login page polls this until status flips to `approved` or `rejected`.

**Returns**: `{ status: "pending" | "approved" | "rejected", userId: string | null, token: string | null }`

When `approved`, the response includes a JWT in `token` for subsequent authenticated calls.

## Admin

### `POST /api/admin/user`
Create a user directly (bypasses login request flow). Admin-only.

**Body**: `{ name: string, role: "student" | "parent" | "teacher" | "admin" }`
**Returns**: `{ userId: string }`

### `GET /api/admin/users` *(planned)*
List all users with status, session count, last activity. Admin-only.

### `POST /api/admin/login-request/:id/approve` *(planned)*
Approve a pending login request. Admin-only.

### `POST /api/admin/login-request/:id/reject` *(planned)*
Reject a pending login request. Admin-only.

## Tutor (auth required)

### `POST /api/tutor/session`
Start a new tutoring session for the authenticated user.

**Returns**: `{ sessionId: string }`

### `POST /api/tutor/:sessionId/image`
Upload a photo (multipart). Stores to S3/local disk, then triggers a full-page DeepSeek-VL2 extraction. The extraction is cached in `vision_extraction` (`region_hash = null`).

**Body**: multipart form, field `file` (image/png, image/jpeg)
**Returns**: `{ imageId: string, extraction: { questions: [...], marked_answers: [...], notes: [...] } }`

### `POST /api/tutor/:sessionId/circle`
Submit a region the user circled on an image. Either a bounding box (server crops) or a pre-cropped image blob from the client (preferred, since Konva already has the geometry).

**Body**:
```json
{
  "imageId": "string",
  "regionBbox": { "x": 0, "y": 0, "w": 100, "h": 50 },
  "croppedImage": "<base64 png>" // optional; if present, server skips its own crop
}
```
**Returns**: `{ regionHash: string, extracted: { text: string, ... } }`

Cached against `vision_extraction(image_id, region_hash)` so re-submitting the same region is free.

### `POST /api/tutor/:sessionId/message`
Send a chat message. Streams the DeepSeek-V3.2 response back via SSE. Abortable: closing the stream from the client interrupts generation, and the partial assistant message is persisted with `interrupted=true`.

**Body**: `{ content: string, imageId?: string, regionHash?: string }`
**Response**: `text/event-stream`. Each event is a JSON chunk:
```
event: token
data: {"delta": "Sure! Let's "}

event: token
data: {"delta": "look at question 3 first..."}

event: done
data: {"messageId": "...", "promptTokens": 412, "completionTokens": 187}
```

### `GET /api/tutor/:sessionId`
Get full session state: metadata, all images with their full-page extractions, and the complete message transcript.

**Returns**:
```json
{
  "session": { "id": "...", "userId": "...", "startedAt": "...", "endedAt": null },
  "images": [
    { "id": "...", "storageUrl": "...", "width": 1200, "height": 1600, "extraction": { ... } }
  ],
  "messages": [
    { "id": "...", "role": "assistant", "content": "...", "imageId": null, "interrupted": false, "createdAt": "..." }
  ]
}
```

## WebSocket *(optional, deferred)*

### `WS /api/ws`
Reserved for future use if we move from SSE to WebSocket — likely needed for voice in/out (v2) or multi-user shared sessions (v2). MVP uses SSE for chat streaming.
