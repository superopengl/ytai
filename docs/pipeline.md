# Eyes/Brain Pipeline

YouTutorAI runs a two-model AI pipeline: **Qwen2.5-VL ("Eyes")** for vision and **deepseek-v4-flash ("Brain")** for chat, both accessed through OpenRouter. Vision is expensive and slow; chat is many-turn. The pipeline is structured so that vision runs at most once per image (plus on-demand for circled regions) and its structured output is cached and reused across every chat turn.

Qwen2.5-VL is the right Eyes for this app specifically because of its native **visual grounding** — it returns bounding boxes alongside extracted content, which is what makes the annotation tool-use loop (Brain → "circle question 3" → frontend draws on Konva canvas) work without a second vision round-trip.

## Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         INITIAL UPLOAD                          │
└─────────────────────────────────────────────────────────────────┘

   [Student/Parent]
        │
        │  snaps photo of worksheet
        ▼
   ┌──────────────┐
   │  Frontend    │  POST /api/tutor/:sessionId/image
   │  (Konva)     │─────────────┐
   └──────────────┘             │
                                ▼
                       ┌─────────────────┐
                       │  Fastify API    │
                       └────────┬────────┘
                                │
                  ┌─────────────┼─────────────┐
                  ▼             ▼             ▼
            ┌─────────┐   ┌──────────┐   ┌────────────┐
            │  S3 /   │   │  Postgres│   │ Qwen2.5-VL │  ◄── "Eyes"
            │  disk   │   │ session_ │   │  (vision)  │      runs ONCE
            └─────────┘   │  image   │   └─────┬──────┘
                          └──────────┘         │
                                               │ structured JSON:
                                               │  { questions[],
                                               │    answers[],
                                               │    teacher_marks,
                                               │    boxes[] }
                                               ▼
                                       ┌──────────────┐
                                       │ vision_      │  ◄── cached,
                                       │ extraction   │      reused on
                                       │ (Postgres)   │      every turn
                                       └──────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                       CHAT TURN  (repeats)                      │
└─────────────────────────────────────────────────────────────────┘

   [Student]
      │
      │  types question        OR        circles a region
      │                                        │
      │                                        ▼
      │                              ┌──────────────────┐
      │                              │ Crop region from │
      │                              │ canvas, POST to  │
      │                              │ /circle endpoint │
      │                              └────────┬─────────┘
      │                                       │
      │                                       ▼
      │                                  ┌────────────┐
      │                                  │ Qwen2.5-VL │  ◄── "Eyes"
      │                                  │   (crop)   │      on demand
      │                                  └─────┬──────┘
      │                                        │ text inside region
      │             ┌─────────────────────────┘
      ▼             ▼
   ┌───────────────────────────────┐
   │  Assemble chat context:       │
   │   • system prompt (Socratic,  │
   │     age-appropriate)          │
   │   • cached vision JSON        │
   │   • prior transcript          │
   │   • new user message (+ crop) │
   └───────────────┬───────────────┘
                   │
                   ▼
            ┌──────────────────┐
            │ deepseek-v4-flash│   ◄── "Brain"
            │   (chat)         │
            └────────┬─────────┘
                     │
                     │  streams tokens
                     ▼
              ┌─────────────┐         ┌─────────────────┐
              │  SSE        │────────►│  Frontend chat  │
              │  /message   │         │  panel          │
              └──────┬──────┘         └────────┬────────┘
                     │                         │
                     │   AbortController       │ [Stop] button
                     │◄────────────────────────┘
                     ▼
              ┌─────────────┐
              │ Persist to  │
              │ session_    │
              │ message     │
              └─────────────┘
```

## Key properties

- **Eyes runs at two moments only**: once at image upload, and once per "circle" action. Never on every chat turn.
- **`vision_extraction` is the cache layer** — it's why Brain can answer dozens of questions about the same worksheet without paying for vision again. It includes per-item bounding boxes from Qwen2.5-VL, used to resolve Brain's annotation tool-calls back to pixel coordinates.
- **deepseek-v4-flash only ever sees text** (system prompt + cached vision JSON + crop text + transcript). The image bytes don't go to Brain.
- **SSE + AbortController** is the single channel where streaming and "Stop" both live.

## Why pipeline, not tool-calling

Brain could in principle call Eyes as a tool whenever it wants to look at the image. We don't do that because:

1. Vision is the slowest, most expensive step — letting Brain re-trigger it on a whim destroys the cost model.
2. For 8–14yo users, explicit UI affordances (the circle button) are clearer than the model deciding for itself when to look again.
3. The cached `vision_extraction` JSON is already a faithful, structured representation of the page — Brain rarely needs more.

If a future feature needs Brain-initiated vision (e.g. "zoom in on the diagram"), introduce it as an explicit tool call rather than removing the cache.
