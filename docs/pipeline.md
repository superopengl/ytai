# Eyes/Brain Pipeline

YouTutorAI runs a two-model AI pipeline: **Qwen2.5-VL ("Eyes")** for vision and **deepseek-v4-flash ("Brain")** for chat, both accessed through OpenRouter. Brain drives every turn; it calls Eyes as a tool whenever it needs to see the page.

We do **not** run a structured upfront extraction. VLMs are good at answering questions about an image but unreliable at producing stable schemas with coordinates — so instead of trying to read the whole page into JSON, Brain just asks one focused question at a time when it needs to know something.

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
   ┌──────────────┐
   │ session_image│   No eager vision call. The image just sits here
   └──────────────┘   until Brain asks for it.


┌─────────────────────────────────────────────────────────────────┐
│                       CHAT TURN  (repeats)                      │
└─────────────────────────────────────────────────────────────────┘

   [Student] types a question
        │
        ▼
   ┌──────────────────────────────────┐
   │  Assemble:                       │
   │   • persona system prompt        │
   │   • "image attached — call       │
   │      lookup_on_image to read it" │
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
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   plain tokens         tool_call: lookup_on_image
        │                         │
        ▼                         ▼
   ┌──────────┐            ┌────────────────────────┐
   │  SSE     │            │ server runs Qwen2.5-VL │
   │ stream   │            │   on the CURRENT image │  ◄── "Eyes"
   └──────────┘            │   bytes + the question │      on demand
                           └─────────┬──────────────┘
                                     │
                                     ▼
                          ┌────────────────────┐
                          │ vision_extraction  │   ◄── cache by
                          │  (image_id,        │       (image, q)
                          │   sha256(question))│
                          └─────────┬──────────┘
                                    │
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

  Brain may also call draw_annotation with a normalized 0..1 bbox
  (often one lookup_on_image just handed back) — the server forwards
  that to the frontend over SSE so Konva draws the shape on top.
```

## Key properties

- **Vision runs on demand**, not eagerly. Brain decides what it needs to know and asks one focused question per call. Cost scales with what the student actually asks about, not with what's on the page.
- **`vision_extraction` is a question-answer cache**, keyed by `(image_id, sha256(question))`. The same lookup twice in a session is free; annotations changing produces a new `image_id`, which correctly invalidates the cache.
- **Strokes are bytes, not bboxes.** The frontend flattens the Konva stage (photo + freehand layer) into a single PNG before sending. Eyes sees the student's circles and underlines directly; the server never has to reason about stroke geometry.
- **deepseek-v4-flash only ever sees text** (system prompt + transcript + tool results). The image bytes go to Eyes; what Brain receives is the natural-language answer Eyes produced.
- **SSE + AbortController** is the single channel where streaming and "Stop" both live. The client closing mid-turn cancels both the Brain stream and any in-flight Eyes call.

## Why on-demand instead of eager extraction

We previously ran a single VL pass on every uploaded image that returned a JSON schema with bounding boxes per question, and Brain referenced that JSON in its context. We dropped that pattern because:

1. **Bbox geometry from VLMs isn't reliable.** Coordinates drift between runs even on the same image, which broke the "where is question 3" grounding the schema was supposed to provide.
2. **Schemas don't compose with the student's natural questions.** A focused Q&A ("what did the student write next to question 3?") beats parsing a fixed schema for an answer Brain has to interpret anyway.
3. **Caching still works** at the per-question level, so the cost story is similar in steady state — and *less* costly on simple text-only conversations where Brain never needs to look at the image.

If a future feature needs the whole-page schema (e.g. a "scan all answers and flag mistakes" pass before chat starts), introduce it as an explicit batch lookup — Brain firing a single broad `lookup_on_image` call — rather than reintroducing eager extraction.
