-- Bind tutor sessions and their reports to a school year (Y3..Y6).
-- tutor_session.year is the year the student was in when the session ran;
-- session_report.year is snapshotted from the parent session at generate
-- time; subject_report.year scopes the rollup to one year of sessions.

ALTER TABLE "ytai"."tutor_session" ADD COLUMN IF NOT EXISTS "year" text NOT NULL DEFAULT 'Y3';
--> statement-breakpoint
ALTER TABLE "ytai"."session_report" ADD COLUMN IF NOT EXISTS "year" text;
--> statement-breakpoint
ALTER TABLE "ytai"."subject_report" ADD COLUMN IF NOT EXISTS "year" text;
--> statement-breakpoint
-- Backfill session_report.year from the parent tutor_session, so pre-year
-- reports read back consistent with their owning session. Legacy
-- subject_report rows stay null — the user will pick a year for any new
-- analysis report, and the old ones simply weren't year-scoped.
UPDATE "ytai"."session_report" sr
SET "year" = ts."year"
FROM "ytai"."tutor_session" ts
WHERE sr."session_id" = ts."id" AND sr."year" IS NULL;
