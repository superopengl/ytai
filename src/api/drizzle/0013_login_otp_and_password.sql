-- Add username/password columns for the admin password-login path, and the
-- login_otp table backing the email-OTP sign-in flow. Google SSO stays the
-- primary path; passwords are only ever populated on `role='admin'`
-- accounts bootstrapped from env vars.
ALTER TABLE "ytai"."user" ADD COLUMN IF NOT EXISTS "user_name" text;
--> statement-breakpoint
ALTER TABLE "ytai"."user" ADD COLUMN IF NOT EXISTS "password_hash" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_user_name_uq" ON "ytai"."user" ("user_name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ytai"."login_otp" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "ytai"."user"("id"),
  "email" text NOT NULL,
  "code" text NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_otp_email_idx" ON "ytai"."login_otp" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_otp_expires_at_idx" ON "ytai"."login_otp" ("expires_at");
