-- Add a cursor to session_report so the report can be incrementally refreshed
-- as the session continues. cursor_message_id is the id of the last
-- session_message folded into the report; staleness check is simply
-- cursor_message_id < latest session_message.id for the session.
ALTER TABLE "ytai"."session_report"
  ADD COLUMN IF NOT EXISTS "cursor_message_id" uuid;

ALTER TABLE "ytai"."session_report"
  ADD COLUMN IF NOT EXISTS "cursor_message_at" timestamp with time zone;

DO $$ BEGIN
 ALTER TABLE "ytai"."session_report"
   ADD CONSTRAINT "session_report_cursor_message_id_fk"
   FOREIGN KEY ("cursor_message_id")
   REFERENCES "ytai"."session_message"("id")
   ON DELETE SET NULL ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- subject_report holds rollups of session_reports for one (user, subject,
-- report_type). Multiple types per (user, subject) — e.g. wrong_questions,
-- strengths_weaknesses, curriculum_map, plus on-demand 'custom' reports
-- keyed by a hash of the user prompt.
CREATE TABLE IF NOT EXISTS "ytai"."subject_report" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "ytai"."user"("id"),
  "subject" text NOT NULL,
  -- 'wrong_questions' | 'strengths_weaknesses' | 'curriculum_map' | 'custom'
  "report_type" text NOT NULL,
  -- For custom: sha256 of the normalized user prompt. NULL for builtins.
  "prompt_hash" text,
  -- Verbatim prompt for custom reports. NULL for builtins.
  "custom_prompt" text,
  "status" text NOT NULL DEFAULT 'pending',
  -- Structured payload — shape varies by report_type but always JSON. UIs
  -- key off `report_type` to know how to render.
  "content" jsonb,
  "narrative" text,
  -- Snapshot of which session_reports were folded in: array of
  -- { session_id, cursor_message_id } pairs. Staleness: any included
  -- session report has moved its cursor, OR the set of sessions for this
  -- (user, subject) has grown since this snapshot.
  "included_sessions" jsonb,
  "model_version" text,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "error" text,
  "generated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Builtin reports are unique per (user, subject, report_type). Custom
-- reports share report_type='custom' and must also disambiguate by
-- prompt_hash so the same prompt collides and identical prompts share
-- a cached result.
CREATE UNIQUE INDEX IF NOT EXISTS "subject_report_user_subject_type_prompt_uq"
  ON "ytai"."subject_report" (
    "user_id",
    "subject",
    "report_type",
    COALESCE("prompt_hash", '')
  );

CREATE INDEX IF NOT EXISTS "subject_report_user_subject_idx"
  ON "ytai"."subject_report" ("user_id", "subject");
