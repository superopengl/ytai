# OCR / Eyes / Brain Pipeline

YouTutorAI runs a three-stage pipeline:
- **EasyOCR** ("OCR") — local Docker sidecar, reads printed text on upload, populates `image_ocr`.
- **Qwen2.5-VL** ("Eyes") — semantic vision through OpenRouter, called on demand.
- **deepseek-v4-flash** ("Brain") — chat through OpenRouter, runs every turn and picks which of the above to call.

Brain prefers OCR (cheap, deterministic, tight bboxes) for any printed text it already knows the wording of, and falls back to Eyes for handwriting, math notation, diagrams, or anything semantic.

We do **not** run a structured upfront *vision* extraction. VLMs are good at answering questions about an image but unreliable at producing stable schemas with coordinates — so instead of trying to read the whole page into JSON, Brain just asks one focused question at a time when it needs to know something. OCR is fine to run eagerly because it's cheap and deterministic.

## Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         IMAGE UPLOAD                            │
└─────────────────────────────────────────────────────────────────┘

   [Student]
        │
        │  snaps photo, may draw circles / underlines on top
        ▼
   ┌──────────────┐         The flattened canvas (photo + strokes)
   │  Frontend    │         is exported on send — strokes are baked
   │  (Konva)     │         into the image bytes Eyes will see.
   └──────────────┘
        │
        │  on first message with this image, dataUrl rides the POST
        ▼
   ┌──────────────┐
   │  Fastify API │  POST /api/tutor/:sessionId/message
   └──────┬───────┘
          │  dedup by sha256(bytes); store on disk; remember
          │  current_image_id on the session.
          ▼
   ┌──────────────┐         ──►  ┌───────────────────────────┐
   │ session_image│              │  ensureImageOcr (async)   │
   └──────────────┘              │  ─────────────────────    │
                                 │  POST to EasyOCR sidecar  │  ◄── local Docker
                                 │  (port 9531)              │      sidecar
                                 │                           │
                                 │  Result lands in          │
                                 │  image_ocr.lines          │
                                 │  (status: pending→ready)  │
                                 └───────────────────────────┘

   No eager *vision* call — Eyes only runs when Brain asks.


┌─────────────────────────────────────────────────────────────────┐
│                       CHAT TURN  (repeats)                      │
└─────────────────────────────────────────────────────────────────┘

   [Student] types a question
        │
        ▼
   ┌──────────────────────────────────┐
   │  Assemble:                       │
   │   • persona system prompt        │
   │   • "image attached — try        │
   │      find_text_on_image first,   │
   │      escalate to lookup_on_image"│
   │   • prior transcript             │
   │   • new user message             │
   └────────────────┬─────────────────┘
                    │
                    ▼
            ┌───────────────────┐
            │ deepseek-v4-flash │  ◄── "Brain"
            │   (chat, tools)   │
            └────────┬──────────┘
                     │
   ┌─────────────────┼─────────────────┐
   │                 │                 │
   ▼                 ▼                 ▼
plain tokens   tool: find_text   tool: lookup_on_image
   │                 │                 │
   ▼                 ▼                 ▼
┌──────┐    ┌──────────────────┐  ┌────────────────────────┐
│ SSE  │    │ string match vs. │  │ server runs Qwen2.5-VL │
│ out  │    │ image_ocr.lines  │  │ on the CURRENT image   │  ◄── "Eyes"
└──────┘    │ (no model call)  │  │ bytes + the question   │      on demand
            │                  │  └─────────┬──────────────┘
            │ returns up to 5  │            │
            │ matches + union  │            ▼
            │ bbox, OR status= │  ┌────────────────────┐
            │ no-match | pend- │  │ vision_extraction  │   ◄── cache by
            │ ing | failed |   │  │  (image_id,        │       (image, q)
            │ unavailable      │  │   sha256(question))│
            └────────┬─────────┘  └─────────┬──────────┘
                     │                      │
                     └──────────┬───────────┘
                                ▼
                        ┌──────────────┐
                        │ tool result  │
                        │ feeds back   │
                        │ into Brain   │
                        └──────┬───────┘
                               │
                               ▼  (loop until Brain stops calling tools)
                        ┌──────────────┐
                        │ Brain emits  │
                        │ final tokens │
                        └──────────────┘

  Brain may also call draw_annotation(shape, x1, y1, x2, y2, color?)
  with a corner bbox from a prior lookup. Before forwarding, the
  server calls snapAnnotationBbox which tightens the region to the
  union of image_ocr lines that fall inside it (when OCR is ready
  and the supplied region is small enough to be a single phrase).
  The snapped bbox is sent over SSE and Konva draws the shape only
  — no text label.
```

## Key properties

- **OCR runs eagerly, vision runs on demand.** EasyOCR is cheap and deterministic so paying it once per image is fine; Eyes is expensive so it only fires when Brain has a focused question OCR couldn't answer.
- **`image_ocr` is a per-image cache**, one row per `image_id` with a `pending → ready/failed` lifecycle. `vision_extraction` is a per-question cache keyed by `(image_id, sha256(question))`. Both are naturally invalidated when annotations change (new bytes → new `image_id`).
- **`find_text_on_image` does no model call.** It's pure string matching against `image_ocr.lines` — substring first, then a token-overlap score with a 0.6 floor. Statuses `no-match | pending | failed | unavailable` are signals for Brain to escalate to Eyes.
- **`draw_annotation` snaps to OCR.** Before the bbox hits the wire, `snapAnnotationBbox` tightens it to the union of OCR lines that sit inside the supplied region. No-op when OCR isn't ready, no lines overlap, or the region is too large (≥35% of the page) to be a single-phrase target.
- **Strokes are bytes, not bboxes.** The frontend flattens the Konva stage (photo + freehand layer) into a single PNG before sending. Eyes sees the student's circles and underlines directly; the server never has to reason about stroke geometry.
- **deepseek-v4-flash only ever sees text** (system prompt + transcript + tool results). The image bytes go to OCR and Eyes; what Brain receives is the OCR match list and/or the natural-language answer Eyes produced.
- **SSE + AbortController** is the single channel where streaming and "Stop" both live. The client closing mid-turn cancels both the Brain stream and any in-flight Eyes call.
- **OCR is optional.** Leaving `YTAI_OCR_BASE_URL` unset disables OCR entirely: `find_text_on_image` returns `unavailable`, the bbox snap is a no-op, and Brain falls through to Eyes for every question.

## Why on-demand instead of eager extraction

We previously ran a single VL pass on every uploaded image that returned a JSON schema with bounding boxes per question, and Brain referenced that JSON in its context. We dropped that pattern because:

1. **Bbox geometry from VLMs isn't reliable.** Coordinates drift between runs even on the same image, which broke the "where is question 3" grounding the schema was supposed to provide.
2. **Schemas don't compose with the student's natural questions.** A focused Q&A ("what did the student write next to question 3?") beats parsing a fixed schema for an answer Brain has to interpret anyway.
3. **Caching still works** at the per-question level, so the cost story is similar in steady state — and *less* costly on simple text-only conversations where Brain never needs to look at the image.

If a future feature needs the whole-page schema (e.g. a "scan all answers and flag mistakes" pass before chat starts), introduce it as an explicit batch lookup — Brain firing a single broad `lookup_on_image` call — rather than reintroducing eager extraction.
