CREATE TABLE IF NOT EXISTS "ytai"."session_report" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"summary" text,
	"questions" jsonb,
	"model_version" text,
	"error" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ytai"."session_report" ADD CONSTRAINT "session_report_session_id_tutor_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "ytai"."tutor_session"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
