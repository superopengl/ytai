-- Snapshot the upstream Eyes (vision) call's cost onto the vision_extraction
-- cache row that captures its result. Every future cache hit on this
-- (image_id, region_hash) skips the LLM entirely, so the row itself is the
-- only record of what the original call cost. The audit log in llm_usage
-- still records the per-call line; these columns make per-image billing
-- queries readable without a join.
ALTER TABLE "ytai"."vision_extraction"
  ADD COLUMN IF NOT EXISTS "provider" text,
  ADD COLUMN IF NOT EXISTS "model" text,
  ADD COLUMN IF NOT EXISTS "input_tokens" integer,
  ADD COLUMN IF NOT EXISTS "output_tokens" integer,
  ADD COLUMN IF NOT EXISTS "reasoning_tokens" integer,
  ADD COLUMN IF NOT EXISTS "cache_read_tokens" integer,
  ADD COLUMN IF NOT EXISTS "cache_write_tokens" integer,
  ADD COLUMN IF NOT EXISTS "cost_usd" numeric;
