-- Per-user mutable preferences. Kept separate from `user` so the auth /
-- identity columns stay narrow and the table grows freely for future
-- preferences without churning the auth row.
--
-- 1:1 with user via user_id-as-PK. Rows are upserted on first write, so a
-- user who has never touched any preference simply has no row.
CREATE TABLE IF NOT EXISTS "ytai"."user_profile" (
    "user_id" uuid PRIMARY KEY NOT NULL,
    "year" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ytai"."user_profile"
    ADD CONSTRAINT "user_profile_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "ytai"."user"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
