-- Drop the unused `user.status` column. It was wired in for an
-- admin-must-approve-pending-users moderation flow that was never built —
-- no route or UI reads the value, only the auth routes copied it into the
-- JWT/response payload as a no-op. Now removed.
ALTER TABLE "ytai"."user" DROP COLUMN IF EXISTS "status";
