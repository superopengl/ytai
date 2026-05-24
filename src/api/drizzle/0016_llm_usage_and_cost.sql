-- Per-call LLM billing audit log. One row per actual upstream call (Brain
-- chat, Eyes vision, session/subject report generation, parallel title
-- generation). Cache hits in vision_extraction don't write rows because
-- they don't cost anything. This table is the source of truth for billing.
--
-- The per-entity token columns added below on session_message,
-- session_report, and subject_report are denormalised convenience caches —
-- they aggregate every llm_usage row that contributed to producing that
-- entity, so the per-message / per-report cost can be read without a join.
ALTER TABLE "ytai"."session_message"
  ADD COLUMN IF NOT EXISTS "cached_prompt_tokens" integer,
  ADD COLUMN IF NOT EXISTS "cost_usd" numeric;
--> statement-breakpoint
ALTER TABLE "ytai"."session_report"
  ADD COLUMN IF NOT EXISTS "cached_prompt_tokens" integer,
  ADD COLUMN IF NOT EXISTS "cost_usd" numeric;
--> statement-breakpoint
ALTER TABLE "ytai"."subject_report"
  ADD COLUMN IF NOT EXISTS "cached_prompt_tokens" integer,
  ADD COLUMN IF NOT EXISTS "cost_usd" numeric;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ytai"."llm_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "ytai"."user"("id"),
  "session_id" uuid REFERENCES "ytai"."tutor_session"("id"),
  "message_id" uuid REFERENCES "ytai"."session_message"("id"),
  "image_id" uuid REFERENCES "ytai"."session_image"("id"),
  "session_report_id" uuid REFERENCES "ytai"."session_report"("session_id"),
  "subject_report_id" uuid REFERENCES "ytai"."subject_report"("id"),
  "purpose" text NOT NULL,
  "provider" text NOT NULL DEFAULT 'openrouter',
  "model" text NOT NULL,
  "model_version" text,
  "prompt_tokens" integer NOT NULL DEFAULT 0,
  "cached_prompt_tokens" integer NOT NULL DEFAULT 0,
  "completion_tokens" integer NOT NULL DEFAULT 0,
  "reasoning_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "cost_usd" numeric,
  "usage_raw" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_usage_user_created_idx"
  ON "ytai"."llm_usage" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_usage_session_idx"
  ON "ytai"."llm_usage" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_usage_message_idx"
  ON "ytai"."llm_usage" ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_usage_purpose_created_idx"
  ON "ytai"."llm_usage" ("purpose", "created_at");
