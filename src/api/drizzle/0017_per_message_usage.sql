-- Restructure per-call usage columns to mirror the actual provider usage
-- shape:
--   input_tokens / output_tokens     (was prompt_tokens / completion_tokens)
--   cache_read_tokens                (was cached_prompt_tokens)
--   cache_write_tokens               NEW
--   reasoning_tokens                 NEW on the per-entity tables
--   provider                         NEW — which platform served the call
-- The audit-log table llm_usage gets the same field-name overhaul so a
-- billing query reads the same column names whether it goes against the
-- per-entity caches or the audit log.

-- session_message
ALTER TABLE "ytai"."session_message"
  RENAME COLUMN "prompt_tokens" TO "input_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."session_message"
  RENAME COLUMN "completion_tokens" TO "output_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."session_message"
  RENAME COLUMN "cached_prompt_tokens" TO "cache_read_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."session_message"
  ADD COLUMN IF NOT EXISTS "cache_write_tokens" integer,
  ADD COLUMN IF NOT EXISTS "reasoning_tokens" integer,
  ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint

-- session_report
ALTER TABLE "ytai"."session_report"
  RENAME COLUMN "prompt_tokens" TO "input_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."session_report"
  RENAME COLUMN "completion_tokens" TO "output_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."session_report"
  RENAME COLUMN "cached_prompt_tokens" TO "cache_read_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."session_report"
  ADD COLUMN IF NOT EXISTS "cache_write_tokens" integer,
  ADD COLUMN IF NOT EXISTS "reasoning_tokens" integer,
  ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint

-- subject_report
ALTER TABLE "ytai"."subject_report"
  RENAME COLUMN "prompt_tokens" TO "input_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."subject_report"
  RENAME COLUMN "completion_tokens" TO "output_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."subject_report"
  RENAME COLUMN "cached_prompt_tokens" TO "cache_read_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."subject_report"
  ADD COLUMN IF NOT EXISTS "cache_write_tokens" integer,
  ADD COLUMN IF NOT EXISTS "reasoning_tokens" integer,
  ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint

-- llm_usage
ALTER TABLE "ytai"."llm_usage"
  RENAME COLUMN "prompt_tokens" TO "input_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."llm_usage"
  RENAME COLUMN "completion_tokens" TO "output_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."llm_usage"
  RENAME COLUMN "cached_prompt_tokens" TO "cache_read_tokens";
--> statement-breakpoint
ALTER TABLE "ytai"."llm_usage"
  ADD COLUMN IF NOT EXISTS "cache_write_tokens" integer NOT NULL DEFAULT 0;
