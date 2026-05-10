# YouTutorAI Database Schema

PostgreSQL with Drizzle ORM. UUID primary keys, singular table names, automatic `created_at`/`updated_at` timestamps.

Schema defined in `src/api/db/schema.js`, migrations in `src/api/drizzle/`.

## Tables

### `user`
Application users. One row per person. Three roles share the same table: `student`, `parent`, `teacher`, plus `admin`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | display name |
| `role` | text | `student` \| `parent` \| `teacher` \| `admin` |
| `status` | text | `pending` \| `approved` \| `rejected` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `login_request`
A user's request to log in; admin must approve before the user can start a session. The login page polls status by `id`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `user.id` |
| `status` | text | `pending` \| `approved` \| `rejected` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `tutor_session`
One row per tutoring sitting. A user starts a new session each time they begin tutoring; the session holds the chat transcript and the uploaded image(s).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `user.id` |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | nullable |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `session_image`
Photos uploaded into a session (worksheets, exam pages). One session can have multiple images. The S3 URL (or local path in dev) is stored here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK → `tutor_session.id` |
| `storage_url` | text | S3 URL (prod) or local file path (dev) |
| `width` | int | original pixel dimensions |
| `height` | int | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `vision_extraction`
Cached DeepSeek-VL2 outputs. Keyed by `(image_id, region_hash)` so re-circling the same area never re-bills VL2. Region `null` means full-page extraction; otherwise a crop bounding box hashed to a stable string.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `image_id` | uuid | FK → `session_image.id` |
| `region_hash` | text | nullable; null = full page |
| `region_bbox` | jsonb | `{ x, y, w, h }` or null |
| `extracted` | jsonb | structured VL2 output |
| `confidence` | numeric | VL2 self-reported confidence (if available) |
| `model_version` | text | e.g. `deepseek-vl2-2026-03` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique index on `(image_id, region_hash)`.

### `session_message`
Chat transcript. Ordered by `created_at`. Messages from VL2 extractions are stored as `system` role with a marker so they're distinguishable from the tutor persona.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK → `tutor_session.id` |
| `role` | text | `user` \| `assistant` \| `system` |
| `content` | text | message body |
| `image_id` | uuid | nullable; FK → `session_image.id` (for messages that reference a specific image/region) |
| `region_hash` | text | nullable; matches `vision_extraction.region_hash` |
| `prompt_tokens` | int | from DeepSeek API response |
| `completion_tokens` | int | |
| `interrupted` | boolean | true if the user hit Stop mid-stream |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

## Relationships

```
user ──< login_request
user ──< tutor_session ──< session_image ──< vision_extraction
                       └──< session_message ──┐
                                              └─ optional FK → session_image
```
