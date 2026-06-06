-- Student-renameable display title for a tutor session. Null means
-- "fall back to the first user message preview" — the default for every
-- pre-existing row. Set via PATCH /api/tutor/:sessionId from the
-- chat-panel Rename menu.
ALTER TABLE "ytai"."tutor_session" ADD COLUMN IF NOT EXISTS "title" text;
