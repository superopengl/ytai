-- Drop the OCR + vision-extraction caches.
--
-- Brain is now a multimodal model that reads the worksheet directly in
-- its user message, so the EasyOCR sidecar and the per-question Eyes
-- cache are both gone. Neither table is written to or read from anymore;
-- the historical rows are unreachable.
DROP TABLE IF EXISTS "ytai"."vision_extraction";
--> statement-breakpoint
DROP TABLE IF EXISTS "ytai"."image_ocr";
