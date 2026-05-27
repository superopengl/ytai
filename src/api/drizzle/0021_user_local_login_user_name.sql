-- Rename the user.user_name column (and its unique index) to make the
-- intent explicit: it's the local username/password login handle for
-- admins, not a general-purpose display name. The `name` column on the
-- same row is the actual display name.
ALTER TABLE "ytai"."user" RENAME COLUMN "user_name" TO "local_login_user_name";
--> statement-breakpoint
ALTER INDEX "ytai"."user_user_name_uq" RENAME TO "user_local_login_user_name_uq";
