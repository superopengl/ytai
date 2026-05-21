-- Add session_doc (a "doc" = 1..N images or a PDF). Backfill: every existing
-- session_image becomes a 1-page doc. tutor_session.current_image_id is
-- replaced by current_doc_id pointing at the doc that holds that image.

CREATE TABLE IF NOT EXISTS "ytai"."session_doc" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "ytai"."tutor_session"("id"),
  "kind" text NOT NULL DEFAULT 'images',
  "source_pdf_url" text,
  "page_count" integer NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_doc_session_id_idx" ON "ytai"."session_doc" ("session_id");
--> statement-breakpoint

ALTER TABLE "ytai"."session_image" ADD COLUMN IF NOT EXISTS "doc_id" uuid;
ALTER TABLE "ytai"."session_image" ADD COLUMN IF NOT EXISTS "page_number" integer NOT NULL DEFAULT 1;
--> statement-breakpoint

-- Backfill: one doc per existing image. sort_order numbers docs within a
-- session by created_at; each doc gets exactly one page (the existing image).
DO $$
DECLARE
  img RECORD;
  new_doc_id uuid;
  order_counter integer := 0;
  current_session uuid := NULL;
BEGIN
  FOR img IN
    SELECT id, session_id, created_at
    FROM "ytai"."session_image"
    WHERE doc_id IS NULL
    ORDER BY session_id, created_at
  LOOP
    IF current_session IS DISTINCT FROM img.session_id THEN
      current_session := img.session_id;
      order_counter := 0;
    END IF;
    INSERT INTO "ytai"."session_doc"
      (session_id, kind, page_count, sort_order, created_at, updated_at)
    VALUES
      (img.session_id, 'images', 1, order_counter, img.created_at, img.created_at)
    RETURNING id INTO new_doc_id;
    UPDATE "ytai"."session_image"
      SET doc_id = new_doc_id, page_number = 1
      WHERE id = img.id;
    order_counter := order_counter + 1;
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE "ytai"."session_image" ALTER COLUMN "doc_id" SET NOT NULL;
ALTER TABLE "ytai"."session_image"
  ADD CONSTRAINT "session_image_doc_id_fk"
  FOREIGN KEY ("doc_id") REFERENCES "ytai"."session_doc"("id");
--> statement-breakpoint

-- Replace the old (session_id, content_hash) dedup with per-doc dedup.
-- Same image bytes within a single doc reuse the existing row; across
-- docs (same session or not) we accept duplicate rows.
DROP INDEX IF EXISTS "ytai"."session_image_session_hash_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "session_image_doc_hash_uq"
  ON "ytai"."session_image" ("doc_id", "content_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "session_image_doc_page_uq"
  ON "ytai"."session_image" ("doc_id", "page_number");
--> statement-breakpoint

-- Replace current_image_id with current_doc_id on tutor_session.
ALTER TABLE "ytai"."tutor_session" ADD COLUMN IF NOT EXISTS "current_doc_id" uuid;

UPDATE "ytai"."tutor_session" t
SET current_doc_id = i.doc_id
FROM "ytai"."session_image" i
WHERE t.current_image_id = i.id;

ALTER TABLE "ytai"."tutor_session" DROP COLUMN IF EXISTS "current_image_id";
