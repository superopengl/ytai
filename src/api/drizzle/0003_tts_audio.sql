CREATE TABLE IF NOT EXISTS "ytai"."tts_audio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text_hash" text NOT NULL,
	"voice" text NOT NULL,
	"model" text NOT NULL,
	"storage_url" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tts_audio_hash_voice_model_uq" ON "ytai"."tts_audio" USING btree ("text_hash","voice","model");
