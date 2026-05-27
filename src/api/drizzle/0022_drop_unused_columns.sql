-- Drop three columns that were declared in the schema but never read or
-- written anywhere in src/api/ outside the schema file itself:
--
--   * vision_extraction.confidence — never populated by lookupOnImage, never
--     read by Brain or the reports pipeline.
--   * vision_extraction.region_bbox — same: no writer, no reader. The bbox
--     Eyes returns is stored inside the `extracted` JSONB, not in this
--     column.
--   * session_message.region_hash — only ever set on vision_extraction.
--     Looks like a copy-paste artefact when the message schema was modelled
--     after the vision-cache schema.
--
-- All three are pure dead weight; dropping them removes future-developer
-- ambiguity about where the region/confidence data actually lives.
ALTER TABLE "ytai"."vision_extraction" DROP COLUMN IF EXISTS "confidence";
--> statement-breakpoint
ALTER TABLE "ytai"."vision_extraction" DROP COLUMN IF EXISTS "region_bbox";
--> statement-breakpoint
ALTER TABLE "ytai"."session_message" DROP COLUMN IF EXISTS "region_hash";
