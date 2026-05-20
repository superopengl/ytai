ALTER TABLE "ytai"."tutor_session" ADD COLUMN IF NOT EXISTS "subject" text DEFAULT 'math' NOT NULL;
