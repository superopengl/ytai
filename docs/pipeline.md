# Tutor Pipeline

YouTutorAI runs a single multimodal model ("Brain") that handles chat, reading, and visual reasoning in one call. Each page of the active doc is attached to the latest user message as an `image_url` block; Brain reads the printed text, the student's handwriting, diagrams, and any freehand marks directly.

Brain is any OpenAI-compatible multimodal model. Default dev setup is `google/gemma-4-e4b` via LM Studio on `http://localhost:9529/v1`; prod can use any multimodal model on OpenRouter (Gemma 4, Gemini 2.5, GPT-4o, etc.).

## Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         DOC UPLOAD                              │
└─────────────────────────────────────────────────────────────────┘

   [Student]
        │
        │  snaps photo(s), may draw circles / underlines on top
        ▼
   ┌──────────────┐         The flattened canvas (photo + strokes)
   │  Frontend    │         is exported on send — strokes are baked
   │  (Konva)     │         into the image bytes Brain will see.
   └──────────────┘
        │
        │  POST /api/tutor/:sessionId/doc — array of {dataUrl, width, height}
        ▼
   ┌──────────────┐
   │  Fastify API │  persist bytes to S3 (or local disk in dev) — one
   └──────┬───────┘  object per session_image row; record session_doc
          │          + session_image rows; point the session at the
          │          new currentDocId.
          ▼
   ┌──────────────┐
   │ session_doc  │  one row per upload set
   │ session_image│  one row per page (page_number 1..N)
   └──────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                       CHAT TURN  (repeats)                      │
└─────────────────────────────────────────────────────────────────┘

   [Student] types a question, optionally with a per-turn freehand
             canvas snapshot showing what they drew this turn
        │
        ▼
   ┌──────────────────────────────────┐
   │  Assemble system prompt:         │
   │   • persona                      │
   │   • subject-specific guidance    │
   │   • pacing (guided/balanced/     │
   │     direct)                      │
   │   • NSW syllabus catalog         │
   │   • "you can see every page      │
   │      directly — call             │
   │      draw_annotation to point"   │
   │   • palette colors used/free     │
   └────────────────┬─────────────────┘
                    │
                    ▼
   ┌────────────────────────────────────────────────────────┐
   │  User message (multimodal):                            │
   │   {text: "Worksheet (page 1 of N):"}                   │
   │   {image_url: data:image/png;base64,...}               │
   │   ...                                                  │
   │   {image_url: ...}                                     │
   │   {text: <student message>}                            │
   │                                                        │
   │  When the student drew on a page this turn, the        │
   │  annotated-canvas bytes substitute for the original    │
   │  page so Brain sees the marks.                         │
   └────────────────┬───────────────────────────────────────┘
                    │
                    ▼
            ┌───────────────────┐
            │ multimodal Brain  │  e.g. Gemma 4 e4b via LM Studio
            │  (chat + vision)  │
            └────────┬──────────┘
                     │
   ┌─────────────────┼─────────────────────┐
   │                 │                     │
   ▼                 ▼                     ▼
plain tokens   tool: draw_annotation   (loop if more rounds)
   │                 │
   ▼                 ▼
┌──────┐    ┌─────────────────────┐
│ SSE  │    │ server validates    │
│ out  │    │ bbox corners, picks │
└──────┘    │ unused palette      │
            │ color, emits SSE    │
            │ event: tool         │
            └──────────┬──────────┘
                       │
                       ▼
                ┌──────────────┐
                │ Konva renders│
                │ shape over   │
                │ the page     │
                └──────────────┘
```

## Key properties

- **One multimodal call per turn.** Brain reads the page directly; there is no OCR sidecar and no separate Eyes call. Removing both has cut the pipeline to one cloud (or local) chat completion per chat turn.
- **Page bytes attach every turn.** The latest user message carries an `image_url` block per page. Prior turns stay text-only in conversation history — Brain sees the worksheet fresh each turn; old assistant replies are text descriptions of what was seen.
- **Strokes are bytes, not bboxes.** The frontend flattens the Konva stage (photo + freehand layer) into a single PNG before sending. Brain interprets the student's circles and underlines as part of the page — the server never reasons about stroke geometry.
- **`draw_annotation` is the only tool.** Brain estimates the bbox itself from what it sees in the image. The server validates corners, assigns a fresh palette color, and forwards the call over SSE.
- **Hallucination guard.** A regex over the assistant content logs warnings when Brain narrates a highlight without actually calling `draw_annotation`. Past phantom-highlight sentences in the transcript are stripped before being fed back to Brain so the pattern doesn't compound.
- **Tool-call loop cap.** Brain is allowed up to `MAX_TOOL_ROUNDS = 10` per turn as a runaway guard, with a tool-spam detector that forces text-only output after 3 consecutive silent tool rounds.
- **SSE + AbortController** is the single channel where streaming and "Stop" both live. The client closing mid-turn cancels Brain's stream.

## Why drop the split pipeline

The previous design split work across three services: a local EasyOCR sidecar that read printed text into `image_ocr`, a Qwen2.5-VL ("Eyes") call for handwriting and semantic queries, and a text-only Brain (deepseek-v4-flash) that orchestrated them via `find_text_on_image` / `lookup_on_image` tools.

The split made sense when Brain was text-only and a vision pass was expensive. Modern multimodal models are cheap enough — and the local-model option (Gemma 4 via LM Studio) is free per-token — that a single multimodal call beats three coordinated ones on cost, latency, and code complexity. The bbox-precision argument for OCR-snapping survived for a while, but `draw_annotation` over a soft `highlight` shape is forgiving enough that loose bboxes still read as the tutor pointing at the right thing.

If a future model regresses on bbox precision badly enough to need snapping, the OCR sidecar can be reintroduced as a `draw_annotation` post-processor without re-splitting the chat path.
