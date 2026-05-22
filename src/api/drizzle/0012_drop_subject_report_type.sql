-- All subject reports are now a single shape: a free-form analysis driven
-- by a user prompt. The previous report_type taxonomy (wrong_questions /
-- strengths_weaknesses / curriculum_map / custom) is gone — those labels
-- live on in the frontend only, as starter prompt templates the user
-- picks from. prompt_hash was only used to dedupe custom-prompt rows
-- back when builtins coexisted; without that distinction it's dead.
ALTER TABLE "ytai"."subject_report" DROP COLUMN IF EXISTS "report_type";
ALTER TABLE "ytai"."subject_report" DROP COLUMN IF EXISTS "prompt_hash";
