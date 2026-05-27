-- Enforce at most one live login_otp row per user. The route handler now
-- upserts on user_id when issuing a code, so a kid mashing the resend
-- button can no longer fan out into multiple simultaneously-valid codes.
--
-- We wipe the table before adding the unique index. Existing OTP rows are
-- short-lived (10-minute TTL) and any in-flight sign-in can simply request
-- a fresh code, so blowing them away is the safest way to guarantee the
-- new index can be created without conflict.
DELETE FROM "ytai"."login_otp";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "login_otp_user_id_uq" ON "ytai"."login_otp" ("user_id");
