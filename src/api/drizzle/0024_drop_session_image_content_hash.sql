-- Drop the sha256 dedup column on session_image.
--
-- Cross-row image sharing isn't needed: each session_image row now maps
-- 1:1 to its own S3 object (keyed by the row UUID). One-to-one ownership
-- lets the delete path mark exactly that S3 object as orphan without
-- worrying about whether another live row still references the same bytes.
DROP INDEX IF EXISTS "ytai"."session_image_doc_hash_uq";
--> statement-breakpoint
ALTER TABLE "ytai"."session_image" DROP COLUMN IF EXISTS "content_hash";
