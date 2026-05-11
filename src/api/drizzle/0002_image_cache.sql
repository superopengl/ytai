ALTER TABLE "ytai"."session_image" ADD COLUMN "content_hash" text;
--> statement-breakpoint
UPDATE "ytai"."session_image" SET "content_hash" = "id"::text WHERE "content_hash" IS NULL;
--> statement-breakpoint
ALTER TABLE "ytai"."session_image" ALTER COLUMN "content_hash" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "session_image_session_hash_uq" ON "ytai"."session_image" ("session_id", "content_hash");
--> statement-breakpoint
ALTER TABLE "ytai"."tutor_session" ADD COLUMN "current_image_id" uuid;
