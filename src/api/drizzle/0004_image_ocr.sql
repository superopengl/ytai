CREATE TABLE IF NOT EXISTS "ytai"."image_ocr" (
	"image_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"lines" jsonb,
	"error" text,
	"model_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ytai"."image_ocr" ADD CONSTRAINT "image_ocr_image_id_session_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "ytai"."session_image"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
