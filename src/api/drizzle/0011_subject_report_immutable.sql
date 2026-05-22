-- subject_report rows are immutable once generated. Every generation
-- attempt now inserts a new row (pending → ready/failed), so the
-- (user_id, subject, report_type, prompt_hash) uniqueness constraint
-- that enforced upsert semantics no longer applies — drop it.
DROP INDEX IF EXISTS "ytai"."subject_report_user_subject_type_prompt_uq";
--> statement-breakpoint

-- The Reports page lists every report for the current user, newest first.
-- A composite (user_id, created_at DESC) index keeps that scan tight as
-- history accumulates.
CREATE INDEX IF NOT EXISTS "subject_report_user_created_idx"
  ON "ytai"."subject_report" ("user_id", "created_at" DESC);
