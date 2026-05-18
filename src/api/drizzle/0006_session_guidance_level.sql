ALTER TABLE "ytai"."tutor_session" ADD COLUMN IF NOT EXISTS "guidance_level" text DEFAULT 'direct' NOT NULL;
