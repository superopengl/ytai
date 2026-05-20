ALTER TABLE "ytai"."user" ADD COLUMN IF NOT EXISTS "auth_provider" text DEFAULT 'local' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ytai"."user" ADD COLUMN IF NOT EXISTS "email" text;
--> statement-breakpoint
ALTER TABLE "ytai"."user" ADD COLUMN IF NOT EXISTS "google_id" text;
--> statement-breakpoint
ALTER TABLE "ytai"."user" ADD COLUMN IF NOT EXISTS "picture" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_uq" ON "ytai"."user" ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_google_id_uq" ON "ytai"."user" ("google_id");
