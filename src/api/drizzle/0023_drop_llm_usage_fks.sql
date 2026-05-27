-- Drop every foreign key constraint on llm_usage.
--
-- llm_usage is the billing ledger — one row per upstream LLM API hit. Those
-- rows must outlive the things they describe: when a user deletes an analysis
-- report, when the admin wipe nukes a student's sessions, when a message is
-- ever pruned, etc., we still need the billing record.
--
-- The id columns stay (they're still useful for grouping and ad-hoc joins),
-- but the FK enforcement goes away so deletes upstream don't 23503 us. This
-- is the same shape as a typical append-only audit log.
ALTER TABLE "ytai"."llm_usage" DROP CONSTRAINT IF EXISTS "llm_usage_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "ytai"."llm_usage" DROP CONSTRAINT IF EXISTS "llm_usage_session_id_fkey";
--> statement-breakpoint
ALTER TABLE "ytai"."llm_usage" DROP CONSTRAINT IF EXISTS "llm_usage_message_id_fkey";
--> statement-breakpoint
ALTER TABLE "ytai"."llm_usage" DROP CONSTRAINT IF EXISTS "llm_usage_image_id_fkey";
--> statement-breakpoint
ALTER TABLE "ytai"."llm_usage" DROP CONSTRAINT IF EXISTS "llm_usage_session_report_id_fkey";
--> statement-breakpoint
ALTER TABLE "ytai"."llm_usage" DROP CONSTRAINT IF EXISTS "llm_usage_subject_report_id_fkey";
